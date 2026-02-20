import { useState, useMemo } from 'react';
import { format, addMinutes, startOfDay, setHours, setMinutes, isSameDay, startOfMonth, endOfMonth, eachDayOfInterval, isToday, isSameMonth, addMonths, subMonths } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ChevronRight, Clock, Car, Calendar as CalendarIcon } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';

type Vehicle = {
  id: number;
  year: number;
  make: string;
  model: string;
  trim?: string;
  price: number;
  imageUrl?: string;
};

type QueueItem = {
  id: number;
  vehicleId: number;
  queueOrder: number;
  status: string;
  scheduledFor?: string;
  vehicle?: Vehicle;
};

type ScheduledPost = {
  id: number;
  scheduledTime: Date;
  vehicle: Vehicle;
  status: 'queued' | 'scheduled' | 'posting' | 'posted' | 'failed' | 'predicted';
};

interface PostingCalendarProps {
  queueItems: QueueItem[];
  schedule: {
    startTime: string;
    intervalMinutes: number;
    isActive: boolean;
  };
}

export function PostingCalendar({ queueItems, schedule }: PostingCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const scheduledPosts = useMemo(() => {
    if (!queueItems.length) return [];

    const posts: ScheduledPost[] = [];
    const now = new Date();
    
    const itemsWithSchedule = queueItems
      .filter(item => 
        item.vehicle && 
        (item.status === 'scheduled' || item.status === 'posting' || 
         (item.status === 'queued' && item.scheduledFor))
      );
    
    itemsWithSchedule.forEach(item => {
      if (item.scheduledFor && item.vehicle) {
        posts.push({
          id: item.id,
          scheduledTime: new Date(item.scheduledFor),
          vehicle: item.vehicle,
          status: item.status as ScheduledPost['status']
        });
      }
    });
    
    if (schedule.isActive) {
      const queuedWithoutSchedule = queueItems
        .filter(item => item.status === 'queued' && !item.scheduledFor && item.vehicle)
        .sort((a, b) => a.queueOrder - b.queueOrder);
      
      if (queuedWithoutSchedule.length > 0) {
        let baseTime = startOfDay(now);
        const [hours, minutes] = schedule.startTime.split(':').map(Number);
        baseTime = setHours(baseTime, hours);
        baseTime = setMinutes(baseTime, minutes);
        
        while (baseTime <= now) {
          baseTime = addMinutes(baseTime, schedule.intervalMinutes);
        }
        
        queuedWithoutSchedule.forEach((item, index) => {
          const scheduledTime = addMinutes(baseTime, index * schedule.intervalMinutes);
          
          if (item.vehicle) {
            posts.push({
              id: item.id,
              scheduledTime,
              vehicle: item.vehicle,
              status: 'predicted'
            });
          }
        });
      }
    }
    
    return posts.sort((a, b) => a.scheduledTime.getTime() - b.scheduledTime.getTime());
  }, [queueItems, schedule]);

  const days = useMemo(() => {
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);
    return eachDayOfInterval({ start, end });
  }, [currentMonth]);

  const getPostsForDay = (day: Date) => {
    return scheduledPosts.filter(post => isSameDay(post.scheduledTime, day));
  };

  const selectedDayPosts = selectedDate ? getPostsForDay(selectedDate) : [];

  const goToPreviousMonth = () => {
    setCurrentMonth(prev => subMonths(prev, 1));
  };

  const goToNextMonth = () => {
    setCurrentMonth(prev => addMonths(prev, 1));
  };

  const goToToday = () => {
    setCurrentMonth(new Date());
  };

  const handleDayClick = (day: Date) => {
    const postsOnDay = getPostsForDay(day);
    if (postsOnDay.length > 0) {
      setSelectedDate(day);
      setDialogOpen(true);
    }
  };

  const firstDayOfMonth = startOfMonth(currentMonth).getDay();
  const paddingDays = Array.from({ length: firstDayOfMonth }, (_, i) => i);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <CalendarIcon className="w-5 h-5" />
              Posting Calendar
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={goToPreviousMonth}
                data-testid="button-prev-month"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={goToToday}
                data-testid="button-today"
              >
                Today
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={goToNextMonth}
                data-testid="button-next-month"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            {format(currentMonth, 'MMMM yyyy')}
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 gap-1 mb-2">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
              <div key={day} className="text-center text-xs font-medium text-muted-foreground py-2">
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {paddingDays.map(i => (
              <div key={`padding-${i}`} className="aspect-square" />
            ))}

            {days.map(day => {
              const postsOnDay = getPostsForDay(day);
              const hasScheduledPosts = postsOnDay.length > 0;
              const isCurrentMonth = isSameMonth(day, currentMonth);
              const isTodayDate = isToday(day);

              return (
                <button
                  key={day.toISOString()}
                  onClick={() => handleDayClick(day)}
                  disabled={!hasScheduledPosts}
                  className={`
                    aspect-square p-1 rounded-lg text-sm relative
                    transition-colors duration-150
                    ${isTodayDate ? 'ring-2 ring-primary ring-offset-1' : ''}
                    ${!isCurrentMonth ? 'text-muted-foreground' : 'text-foreground'}
                    ${hasScheduledPosts ? 'bg-primary/10 hover:bg-primary/20 cursor-pointer' : 'hover:bg-muted'}
                  `}
                  data-testid={`calendar-day-${format(day, 'yyyy-MM-dd')}`}
                >
                  <span className={`${isTodayDate ? 'font-bold text-primary' : ''}`}>
                    {format(day, 'd')}
                  </span>
                  
                  {hasScheduledPosts && (
                    <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex gap-0.5">
                      {postsOnDay.length <= 3 ? (
                        postsOnDay.map((_, idx) => (
                          <div
                            key={idx}
                            className="w-1.5 h-1.5 rounded-full bg-primary"
                          />
                        ))
                      ) : (
                        <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4">
                          {postsOnDay.length}
                        </Badge>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {!schedule.isActive && (
            <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-sm text-amber-800">
                Automated posting is currently disabled. Enable it to see scheduled posts on the calendar.
              </p>
            </div>
          )}

          {schedule.isActive && scheduledPosts.length === 0 && (
            <div className="mt-4 p-3 bg-muted border border-border rounded-lg">
              <p className="text-sm text-muted-foreground">
                No vehicles in the queue. Add vehicles to see their scheduled posting times.
              </p>
            </div>
          )}
          
          {scheduledPosts.length > 0 && (
            <div className="mt-4 pt-4 border-t flex items-center gap-4 text-xs text-muted-foreground">
              <span className="font-medium">Legend:</span>
              <div className="flex items-center gap-1">
                <Badge variant="outline" className="text-[10px] bg-green-100 text-green-700 border-green-200">
                  Confirmed
                </Badge>
                <span>Scheduled by system</span>
              </div>
              <div className="flex items-center gap-1">
                <Badge variant="outline" className="text-[10px] bg-amber-100 text-amber-700 border-amber-200">
                  Est.
                </Badge>
                <span>Estimated based on settings</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {scheduledPosts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Upcoming Posts</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[200px]">
              <div className="space-y-3">
                {scheduledPosts.slice(0, 10).map((post) => (
                  <div
                    key={post.id}
                    className={`flex items-center gap-3 p-3 rounded-lg ${
                      post.status === 'predicted' ? 'bg-amber-50 border border-amber-100' : 'bg-muted'
                    }`}
                    data-testid={`upcoming-post-${post.id}`}
                  >
                    {post.vehicle.imageUrl ? (
                      <img
                        src={post.vehicle.imageUrl}
                        alt={`${post.vehicle.year} ${post.vehicle.make} ${post.vehicle.model}`}
                        className="w-16 h-12 object-cover rounded"
                      />
                    ) : (
                      <div className="w-16 h-12 bg-muted rounded flex items-center justify-center">
                        <Car className="w-6 h-6 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm truncate">
                          {post.vehicle.year} {post.vehicle.make} {post.vehicle.model}
                          {post.vehicle.trim && ` ${post.vehicle.trim}`}
                        </p>
                        {post.status === 'predicted' && (
                          <Badge variant="outline" className="text-[10px] bg-amber-100 text-amber-700 border-amber-200">
                            Est.
                          </Badge>
                        )}
                        {post.status === 'scheduled' && (
                          <Badge variant="outline" className="text-[10px] bg-green-100 text-green-700 border-green-200">
                            Confirmed
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        ${post.vehicle.price.toLocaleString()}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-primary">
                        {format(post.scheduledTime, 'MMM d')}
                      </p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1 justify-end">
                        <Clock className="w-3 h-3" />
                        {format(post.scheduledTime, 'h:mm a')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
            
            {scheduledPosts.length > 10 && (
              <p className="text-xs text-muted-foreground mt-2 text-center">
                + {scheduledPosts.length - 10} more scheduled posts
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              Scheduled Posts for {selectedDate && format(selectedDate, 'MMMM d, yyyy')}
            </DialogTitle>
            <DialogDescription>
              {selectedDayPosts.length} post{selectedDayPosts.length !== 1 ? 's' : ''} scheduled
            </DialogDescription>
          </DialogHeader>
          
          <ScrollArea className="max-h-[400px]">
            <div className="space-y-3">
              {selectedDayPosts.map((post) => (
                <div
                  key={post.id}
                  className={`flex items-center gap-3 p-3 border rounded-lg ${
                    post.status === 'predicted' ? 'border-amber-200 bg-amber-50' : ''
                  }`}
                  data-testid={`dialog-post-${post.id}`}
                >
                  {post.vehicle.imageUrl ? (
                    <img
                      src={post.vehicle.imageUrl}
                      alt={`${post.vehicle.year} ${post.vehicle.make} ${post.vehicle.model}`}
                      className="w-20 h-14 object-cover rounded"
                    />
                  ) : (
                    <div className="w-20 h-14 bg-muted rounded flex items-center justify-center">
                      <Car className="w-8 h-8 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">
                        {post.vehicle.year} {post.vehicle.make} {post.vehicle.model}
                      </p>
                      {post.status === 'predicted' && (
                        <Badge variant="outline" className="text-[10px] bg-amber-100 text-amber-700 border-amber-200">
                          Estimated
                        </Badge>
                      )}
                      {post.status === 'scheduled' && (
                        <Badge variant="outline" className="text-[10px] bg-green-100 text-green-700 border-green-200">
                          Confirmed
                        </Badge>
                      )}
                    </div>
                    {post.vehicle.trim && (
                      <p className="text-sm text-muted-foreground">{post.vehicle.trim}</p>
                    )}
                    <p className="text-sm text-muted-foreground">
                      ${post.vehicle.price.toLocaleString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <Badge variant="outline" className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {format(post.scheduledTime, 'h:mm a')}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
