import cron from "node-cron";
import { storage } from "./storage";
import { facebookService } from "./facebook-service";

let schedulerActive = false;
let schedulerTask: ReturnType<typeof cron.schedule> | null = null;
let isProcessing = false;

async function processPostingQueues() {
  if (isProcessing) {
    console.log("Previous posting cycle still running, skipping...");
    return;
  }
  
  isProcessing = true;
  
  try {
    const schedules = await storage.getAllPostingSchedules(1);
    
    for (const schedule of schedules) {
      if (!schedule.isActive) continue;
      
      const dealershipId = schedule.dealershipId || 1;
      const now = new Date();
      
      if (schedule.lastPostedAt) {
        const minutesSinceLastPost = (now.getTime() - schedule.lastPostedAt.getTime()) / 60000;
        if (minutesSinceLastPost < schedule.intervalMinutes) {
          continue;
        }
      }
      
      const [startHour, startMinute] = schedule.startTime.split(':').map(Number);
      const currentHour = now.getHours();
      const currentMinute = now.getMinutes();
      const currentTimeMinutes = currentHour * 60 + currentMinute;
      const startTimeMinutes = startHour * 60 + startMinute;
      
      if (currentTimeMinutes < startTimeMinutes) {
        continue;
      }
      
      const queue = await storage.getPostingQueueByUser(schedule.userId, dealershipId);
      const queuedItems = queue
        .filter(item => item.status === 'queued')
        .sort((a, b) => a.queueOrder - b.queueOrder);
      
      if (queuedItems.length === 0) {
        console.log(`No queued items for user ${schedule.userId}`);
        continue;
      }
      
      const nextItem = queuedItems[0];
      
      try {
        const vehicle = await storage.getVehicleById(nextItem.vehicleId, dealershipId);
        if (!vehicle) {
          await storage.updatePostingQueueItem(nextItem.id, schedule.userId, dealershipId, {
            status: 'failed',
            errorMessage: 'Vehicle not found'
          });
          continue;
        }
        
        let account;
        if (nextItem.facebookAccountId) {
          account = await storage.getFacebookAccountById(nextItem.facebookAccountId, schedule.userId, dealershipId);
        } else {
          const accounts = await storage.getFacebookAccountsByUser(schedule.userId, dealershipId);
          account = accounts.find(acc => acc.isActive && acc.accessToken);
        }
        
        if (!account || !account.accessToken) {
          await storage.updatePostingQueueItem(nextItem.id, schedule.userId, dealershipId, {
            status: 'failed',
            errorMessage: 'No active Facebook account found'
          });
          continue;
        }
        
        let template;
        if (nextItem.templateId) {
          template = await storage.getAdTemplateById(nextItem.templateId, schedule.userId, dealershipId);
        } else {
          const templates = await storage.getAdTemplatesByUser(schedule.userId, dealershipId);
          template = templates.find(t => t.isDefault) || templates[0];
        }
        
        if (!template) {
          await storage.updatePostingQueueItem(nextItem.id, schedule.userId, dealershipId, {
            status: 'failed',
            errorMessage: 'No ad template found'
          });
          continue;
        }
        
        await storage.updatePostingQueueItem(nextItem.id, schedule.userId, dealershipId, {
          status: 'posting'
        });
        
        const { postId } = await facebookService.postToMarketplace(
          account.accessToken,
          vehicle,
          {
            titleTemplate: template.titleTemplate,
            descriptionTemplate: template.descriptionTemplate
          }
        );
        
        const postedAt = new Date();
        
        await storage.updatePostingQueueItem(nextItem.id, schedule.userId, dealershipId, {
          status: 'posted',
          facebookPostId: postId,
          postedAt
        });
        
        await storage.updatePostingSchedule(schedule.userId, dealershipId, {
          lastPostedAt: postedAt
        });
        
        console.log(`Successfully posted vehicle ${vehicle.id} to Facebook for user ${schedule.userId}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        await storage.updatePostingQueueItem(nextItem.id, schedule.userId, dealershipId, {
          status: 'failed',
          errorMessage
        });
        console.error(`Failed to post vehicle for user ${schedule.userId}:`, error);
      }
    }
  } catch (error) {
    console.error("Error processing posting queues:", error);
  } finally {
    isProcessing = false;
  }
}

export function startPostingScheduler() {
  if (schedulerActive) {
    console.log("Posting scheduler already running");
    return;
  }
  
  schedulerTask = cron.schedule('* * * * *', processPostingQueues);
  schedulerActive = true;
  console.log("✓ Facebook posting scheduler started (runs every minute)");
}

export function stopPostingScheduler() {
  if (schedulerTask) {
    schedulerTask.stop();
    schedulerTask = null;
    schedulerActive = false;
    console.log("Facebook posting scheduler stopped");
  }
}

export async function getSchedulerStatus() {
  const schedules = await storage.getAllPostingSchedules(1);
  return {
    active: schedulerActive,
    processing: isProcessing,
    schedules: schedules.map(s => ({
      userId: s.userId,
      isActive: s.isActive,
      lastPostedAt: s.lastPostedAt,
      intervalMinutes: s.intervalMinutes
    }))
  };
}
