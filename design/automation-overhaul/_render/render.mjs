import fs from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer';

const ROOT = 'C:/Users/omino/projects/lotview/design/automation-overhaul';

const colors = {
  bg: '#FFFFFF',
  subtle: '#F7FAFC',
  muted: '#EDF2F7',
  border: '#E2E8F0',
  borderStrong: '#CBD5E0',
  text: '#1A202C',
  textMuted: '#4A5568',
  textSubtle: '#718096',
  primary: '#1A365D',
  success: '#276749',
  warning: '#975A16',
  danger: '#9B2C2C',
};

function svgHeader({ w, h, title }) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">\n` +
    `<title>${escapeXml(title)}</title>\n` +
    `<style>\n` +
    `  .bg{fill:${colors.bg}}\n` +
    `  .subtle{fill:${colors.subtle}}\n` +
    `  .muted{fill:${colors.muted}}\n` +
    `  .border{stroke:${colors.border};stroke-width:1}\n` +
    `  .border2{stroke:${colors.borderStrong};stroke-width:1}\n` +
    `  .t{font-family: Inter, Segoe UI, Arial, sans-serif; fill:${colors.text}}\n` +
    `  .tm{fill:${colors.textMuted}}\n` +
    `  .ts{fill:${colors.textSubtle}}\n` +
    `  .h1{font-size:22px;font-weight:700}\n` +
    `  .h2{font-size:16px;font-weight:700}\n` +
    `  .b{font-size:13px;font-weight:600}\n` +
    `  .p{font-size:12px;font-weight:500}\n` +
    `  .mono{font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size:11px}\n` +
    `  .chip{fill:${colors.muted}; stroke:${colors.border}; stroke-width:1}\n` +
    `  .chipText{font-size:11px;font-weight:700; fill:${colors.textMuted}}\n` +
    `  .primaryBtn{fill:${colors.primary}}\n` +
    `  .primaryBtnText{font-size:12px;font-weight:700; fill:#fff}\n` +
    `  .ghostBtn{fill:${colors.subtle}; stroke:${colors.border}; stroke-width:1}\n` +
    `  .dangerBtn{fill:${colors.danger}}\n` +
    `  .dangerText{fill:#fff;font-weight:800;font-size:12px}\n` +
    `  .callout{fill:${colors.subtle}; stroke:${colors.borderStrong}; stroke-width:1}\n` +
    `  .kbd{fill:#fff; stroke:${colors.borderStrong}; stroke-width:1}\n` +
    `  .focus{fill:none; stroke:${colors.primary}; stroke-width:2; stroke-dasharray:6 4}\n` +
    `</style>\n`;
}

function svgFooter() { return `</svg>\n`; }

function escapeXml(s){
  return String(s)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&apos;');
}

function rect(x,y,w,h,cls='subtle',extra=''){return `<rect x="${x}" y="${y}" width="${w}" height="${h}" class="${cls}" ${extra}/>`;}
function strokeRect(x,y,w,h,cls='border'){return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" class="${cls}"/>`;}
function text(x,y,txt,cls='p',extra=''){return `<text x="${x}" y="${y}" class="t ${cls}" ${extra}>${escapeXml(txt)}</text>`;}
function chip(x,y,label){
  const w = Math.max(58, label.length*7.2 + 20);
  return `${rect(x,y, w, 22,'chip')} ${text(x+10,y+15,label,'chipText')}`;
}
function buttonPrimary(x,y,label,w=120){
  return `${rect(x,y,w,30,'primaryBtn',`rx="8"`)}${text(x+12,y+20,label,'primaryBtnText')}`;
}
function buttonGhost(x,y,label,w=120){
  return `${rect(x,y,w,30,'ghostBtn',`rx="8"`)}${text(x+12,y+20,label,'b tm')}`;
}
function buttonDanger(x,y,label,w=160){
  return `${rect(x,y,w,30,'dangerBtn',`rx="8"`)}${text(x+12,y+20,label,'dangerText')}`;
}

function appFrame({ title, subtitle, statusChip='Automation: ON', w=1440, h=900 }){
  const navW=220;
  const topH=62;
  const contentX=navW;
  return (
    svgHeader({w,h,title})+
    rect(0,0,w,h,'bg')+
    rect(0,0,navW,h,'subtle')+
    strokeRect(0,0,navW,h,'border')+
    text(18,32,'LotView','h2')+
    chip(18,48,'Dealer: Olympic Auto')+
    text(18,92,'Inbox','b tm')+
    text(18,118,'Competitive','b tm')+
    text(18,144,'Appraisals','b tm')+
    text(18,170,'Automation','b tm')+
    rect(contentX,0,w-contentX,topH,'bg')+
    strokeRect(contentX,0,w-contentX,topH,'border')+
    text(contentX+22,28,title,'h1')+
    text(contentX+22,48,subtitle,'p ts')+
    chip(w-300,18,statusChip)+
    buttonDanger(w-160-22,16,'KILL SWITCH',160)+
    ''
  );
}

function screen_FBInbox(state){
  const w=1440,h=900,navW=220,topH=62;
  let svg = appFrame({
    title:'FB Marketplace Inbox',
    subtitle:'Fast replies with guardrails. Auto-send default ON; everything is logged.',
    statusChip:'Automation: ON (FB)'
  });

  const x0=navW+16, y0=topH+16;
  const listW=340;
  const ctxW=320;
  const midW = w - navW - 16*3 - listW - ctxW;
  const panelH = h - topH - 16*2;

  // Panels
  svg += rect(x0,y0,listW,panelH,'bg');
  svg += strokeRect(x0,y0,listW,panelH);
  svg += text(x0+14,y0+26,'Conversations','h2');
  svg += chip(x0+14,y0+36,'Unassigned: 4');
  svg += chip(x0+130,y0+36,'SLA risk: 2');

  svg += rect(x0+listW+16,y0,midW,panelH,'bg');
  svg += strokeRect(x0+listW+16,y0,midW,panelH);
  svg += text(x0+listW+30,y0+26,'Transcript','h2');

  svg += rect(x0+listW+16+midW+16,y0,ctxW,panelH,'bg');
  svg += strokeRect(x0+listW+16+midW+16,y0,ctxW,panelH);
  svg += text(x0+listW+16+midW+30,y0+26,'Vehicle + Controls','h2');

  // Conversation list items
  const itemY = y0+74;
  for(let i=0;i<7;i++){
    const iy = itemY + i*78;
    svg += rect(x0+10,iy,listW-20,66,'subtle',`rx="10"`);
    svg += text(x0+22,iy+22, i===0 ? 'Sam P. — “Is it available?”' : `Lead ${i+1} — New msg`,'b');
    svg += text(x0+22,iy+42, i===0 ? '2019 Ford F-150 XLT · 68k km' : 'Vehicle not mapped','p ts');
    svg += chip(x0+listW-140,iy+14, i===0 ? 'AUTO' : 'NEEDS');
    svg += text(x0+listW-140,iy+54, i===0 ? '2m' : `${10+i}m`,'mono ts');
  }

  // Transcript region
  const tx = x0+listW+16;
  const ty = y0+54;
  svg += rect(tx+12,ty+10,midW-24,46,'callout',`rx="10"`);
  svg += text(tx+24,ty+30,'Thread status: Auto-send ON · Last inbound 2m ago · No policy blocks','b');
  svg += text(tx+24,ty+48,'Escalation: none · Anti-loop: OK (0/2 auto turns used)','p ts');

  if(state==='loading'){
    // Skeleton bubbles
    for(let i=0;i<7;i++){
      const by = ty+80+i*68;
      svg += rect(tx+24,by,midW-140,18,'muted',`rx="9"`);
      svg += rect(tx+24,by+24,midW-220,14,'muted',`rx="7"`);
    }
    svg += rect(tx+24,h-160,midW-48,80,'subtle',`rx="10"`);
    svg += text(tx+38,h-126,'Loading transcript…','b tm');
  } else if(state==='empty'){
    svg += rect(tx+24,ty+120,midW-48,220,'subtle',`rx="12"`);
    svg += text(tx+48,ty+160,'No conversations yet','h2');
    svg += text(tx+48,ty+188,'When Marketplace messages come in, they appear here with SLA + automation state.','p ts');
    svg += buttonGhost(tx+48,ty+210,'Import latest threads',180);
  } else if(state==='error'){
    svg += rect(tx+24,ty+120,midW-48,220,'subtle',`rx="12"`);
    svg += text(tx+48,ty+160,'Can’t load messages','h2');
    svg += text(tx+48,ty+188,'We paused auto-send for safety. Reconnect the extension tab or retry.','p ts');
    svg += buttonPrimary(tx+48,ty+214,'Retry',110);
    svg += buttonGhost(tx+168,ty+214,'View diagnostics',160);
    svg += chip(tx+48,ty+256,'State: BLOCKED');
  } else {
    // Bubbles
    svg += rect(tx+24,ty+92,midW-220,54,'subtle',`rx="12"`);
    svg += text(tx+40,ty+118,'Buyer (Sam): Is the F-150 still available?','p');
    svg += text(tx+40,ty+140,'11:04am','mono ts');

    svg += rect(tx+220,ty+164,midW-244,84,'bg');
    svg += strokeRect(tx+220,ty+164,midW-244,84,'border2');
    svg += text(tx+236,ty+192,'LotView (AUTO): Hey Sam—yes, the 2019 F-150 XLT is available.','p');
    svg += text(tx+236,ty+212,'Want to come by today? We’re in Surrey—what time works?','p');
    svg += text(tx+236,ty+236,'Will send after typing simulation · ETA 6s · Why? (Allowlisted intent)','mono ts');

    // Typing simulation strip
    svg += rect(tx+24,h-232,midW-48,34,'callout',`rx="10"`);
    svg += text(tx+40,h-210,'Typing… 6s left (jittered) · Abort available','b');
    svg += buttonGhost(tx+midW-48-96-16,h-226,'Abort',96);

    // Suggested replies
    svg += rect(tx+24,h-188,midW-48,116,'subtle',`rx="12"`);
    svg += text(tx+40,h-164,'Suggested replies','b');
    svg += rect(tx+40,h-150,midW-88,34,'bg');
    svg += strokeRect(tx+40,h-150,midW-88,34,'border');
    svg += text(tx+52,h-128,'1) Confirm availability + offer appointment (auto-send allowed)','p');
    svg += rect(tx+40,h-110,midW-88,34,'bg');
    svg += strokeRect(tx+40,h-110,midW-88,34,'border');
    svg += text(tx+52,h-88,'2) Ask a clarifying question (needs approval if vehicle not mapped)','p');
  }

  // Context panel content
  const cx = x0+listW+16+midW+16;
  const cy = y0+54;
  svg += rect(cx+14,cy+10,ctxW-28,116,'subtle',`rx="12"`);
  svg += text(cx+28,cy+36,'Vehicle','b');
  svg += text(cx+28,cy+56,'2019 Ford F-150 XLT','p');
  svg += text(cx+28,cy+74,'Stock: F150-19-220 · 68,104 km','p ts');
  svg += text(cx+28,cy+94,'Mapping confidence: High','mono ts');

  svg += rect(cx+14,cy+142,ctxW-28,180,'subtle',`rx="12"`);
  svg += text(cx+28,cy+168,'Auto-send','b');
  svg += chip(cx+28,cy+180,'ON (per-thread)');
  svg += text(cx+28,cy+214,'Safety envelope: allowlisted intent, within hours, no DNC.','p ts');
  svg += buttonGhost(cx+28,cy+236,'Pause this thread',170);
  svg += buttonGhost(cx+28,cy+272,'Escalate to human',170);

  svg += rect(cx+14,cy+336,ctxW-28,210,'subtle',`rx="12"`);
  svg += text(cx+28,cy+362,'Audit','b');
  svg += text(cx+28,cy+386,'11:04 inbound received','mono ts');
  svg += text(cx+28,cy+404,'11:05 reply generated (AUTO)','mono ts');
  svg += text(cx+28,cy+422,'11:05 typing sim started','mono ts');
  svg += buttonPrimary(cx+28,cy+452,'View audit log',160);

  svg += svgFooter();
  return svg;
}

function screen_AutomationSettings(state){
  const w=1440,h=900,navW=220,topH=62;
  let svg = appFrame({
    title:'Automation Settings',
    subtitle:'Dealer-wide guardrails for auto-send, typing simulation, escalation, and audit access.',
    statusChip:'Automation: ON (Dealer)'
  });
  const x=navW+16, y=topH+16;

  // Two-column settings cards
  const colW = (w-navW-16*3)/2;
  const cardH = 190;
  const gap=16;

  function card(cx,cy,title){
    return rect(cx,cy,colW,cardH,'bg')+strokeRect(cx,cy,colW,cardH)+text(cx+16,cy+28,title,'h2');
  }

  svg += card(x,y,'FB Auto-send thresholds');
  svg += text(x+16,y+58,'Default mode','p ts');
  svg += chip(x+16,y+68,'AUTO-SEND: ON');
  svg += text(x+16,y+104,'Lead name confidence ≥ 0.75','p');
  svg += text(x+16,y+126,'Vehicle mapping confidence ≥ 0.80','p');
  svg += text(x+16,y+148,'Max auto turns per thread: 2','p');
  svg += buttonGhost(x+colW-160-16,y+142,'Edit',80);

  svg += card(x+colW+gap,y,'Business hours + rate limits');
  svg += text(x+colW+gap+16,y+58,'Business hours (local)','p ts');
  svg += text(x+colW+gap+16,y+82,'Mon–Fri 9:00–18:00 · Sat 10:00–16:00','p');
  svg += chip(x+colW+gap+16,y+94,'After-hours: Suggest only');
  svg += text(x+colW+gap+16,y+132,'Rate limit: 35 auto sends / user / day','p');
  svg += text(x+colW+gap+16,y+154,'Burst: 6 / hour (rolling)','p');

  svg += card(x,y+cardH+gap,'Typing simulation');
  svg += text(x+16,y+cardH+gap+58,'ms/char','p ts');
  svg += text(x+16,y+cardH+gap+82,'30–90ms (jitter 18%)','p');
  svg += text(x+16,y+cardH+gap+106,'Pause every 28–44 chars (150–450ms)','p');
  svg += text(x+16,y+cardH+gap+130,'Abort on DOM drift / focus loss / action block','p');
  svg += buttonGhost(x+colW-160-16,y+cardH+gap+142,'Preview',110);

  svg += card(x+colW+gap,y+cardH+gap,'Escalation rules');
  svg += text(x+colW+gap+16,y+cardH+gap+58,'Auto-send is blocked when:','p ts');
  svg += text(x+colW+gap+16,y+cardH+gap+82,'• intent is denylisted (price negotiation, financing promises)','p');
  svg += text(x+colW+gap+16,y+cardH+gap+106,'• missing lead name / vehicle confidence','p');
  svg += text(x+colW+gap+16,y+cardH+gap+130,'• second auto turn already used','p');

  // Bottom: Audit access + kill
  const by = y + (cardH+gap)*2;
  svg += rect(x,by,w-navW-32,180,'bg');
  svg += strokeRect(x,by,w-navW-32,180);
  svg += text(x+16,by+28,'Audit + Safety','h2');
  svg += text(x+16,by+56,'All outbound actions are logged with mode, policy report, confidence scores, and typing duration.','p ts');
  svg += buttonPrimary(x+16,by+84,'Open audit log',160);
  svg += buttonDanger(x+220,by+84,'PAUSE ALL AUTOMATION',210);
  svg += text(x+16,by+136,'Pausing stops auto-send immediately. Suggestions still generate unless you disable generation.','p ts');

  if(state==='loading'){
    svg += rect(x,by+190,w-navW-32,100,'subtle',`rx="12"`);
    svg += text(x+16,by+248,'Loading settings…','b tm');
  } else if(state==='empty'){
    svg += rect(x,by+190,w-navW-32,130,'subtle',`rx="12"`);
    svg += text(x+16,by+232,'No policy configured yet','h2');
    svg += text(x+16,by+256,'Start with the recommended defaults, then tune per store.','p ts');
    svg += buttonPrimary(x+16,by+280,'Apply recommended defaults',240);
  } else if(state==='error'){
    svg += rect(x,by+190,w-navW-32,130,'subtle',`rx="12"`);
    svg += text(x+16,by+232,'Couldn’t load automation settings','h2');
    svg += text(x+16,by+256,'For safety, automation is paused until we can confirm policy rules.','p ts');
    svg += buttonPrimary(x+16,by+282,'Retry',110);
    svg += chip(x+140,by+282,'State: PAUSED');
  }

  svg += svgFooter();
  return svg;
}

function screen_CompetitiveDashboard(state){
  const w=1440,h=900,navW=220,topH=62;
  let svg = appFrame({
    title:'Competitive Report',
    subtitle:'Every 48h snapshot. Price bands, comp sets, and export-ready tables.',
    statusChip:'Last run: 2h ago'
  });
  const x=navW+16,y=topH+16;

  // Filters
  svg += rect(x,y,w-navW-32,66,'bg');
  svg += strokeRect(x,y,w-navW-32,66);
  svg += text(x+16,y+26,'Filters','h2');
  svg += chip(x+16,y+34,'Radius: 0–25km');
  svg += chip(x+130,y+34,'Radius: 25–50km');
  svg += chip(x+258,y+34,'Radius: 50–100km');
  svg += chip(x+394,y+34,'Make: Any');
  svg += chip(x+502,y+34,'Trim: Any');
  svg += buttonGhost(x+w-navW-32-90-16,y+18,'Reset',90);

  // Price band card
  const cardY=y+66+16;
  svg += rect(x,cardY,520,176,'bg');
  svg += strokeRect(x,cardY,520,176);
  svg += text(x+16,cardY+28,'Recommended price band','h2');
  svg += text(x+16,cardY+52,'Unit selected: 2020 RAV4 XLE · DOM 41','p ts');
  svg += rect(x+16,cardY+72,488,56,'subtle',`rx="12"`);
  svg += text(x+30,cardY+106,'$29,900  —  $32,400','h1');
  svg += chip(x+16,cardY+136,'Confidence: High');
  svg += buttonGhost(x+520-120-16,cardY+134,'Why?',80);

  // Inventory table card
  const tableX=x+520+16;
  const tableW=w-navW-32-520-16;
  svg += rect(tableX,cardY,tableW, h-(cardY)-16,'bg');
  svg += strokeRect(tableX,cardY,tableW, h-(cardY)-16);
  svg += text(tableX+16,cardY+28,'Inventory vs comps','h2');
  svg += text(tableX+16,cardY+52,'Click a row to drill into its comp set. Unknowns are explicit.','p ts');

  // Table header
  const thY=cardY+72;
  svg += rect(tableX+16,thY,tableW-32,30,'subtle');
  svg += strokeRect(tableX+16,thY,tableW-32,30);
  const cols=['Unit','Price','DOM','Km','Trim match','# Comps','Position'];
  const colX=[0,250,330,390,460,590,660];
  for(let i=0;i<cols.length;i++) svg += text(tableX+24+colX[i],thY+20,cols[i],'b tm');

  if(state==='loading'){
    for(let r=0;r<10;r++){
      const ry=thY+40+r*44;
      svg += rect(tableX+16,ry,tableW-32,34,'muted',`rx="8"`);
    }
    svg += text(x+16,cardY+166,'Loading snapshot…','b tm');
  } else if(state==='empty'){
    svg += rect(tableX+16,thY+40,tableW-32,160,'subtle',`rx="12"`);
    svg += text(tableX+40,thY+86,'No competitive data yet','h2');
    svg += text(tableX+40,thY+112,'Run the first snapshot to populate comp sets for your inventory.','p ts');
    svg += buttonPrimary(tableX+40,thY+130,'Run snapshot now',180);
  } else if(state==='error'){
    svg += rect(tableX+16,thY+40,tableW-32,160,'subtle',`rx="12"`);
    svg += text(tableX+40,thY+86,'Snapshot failed','h2');
    svg += text(tableX+40,thY+112,'ZenRows/API error. Your last successful run is still available.','p ts');
    svg += buttonPrimary(tableX+40,thY+132,'Retry',110);
    svg += buttonGhost(tableX+160,thY+132,'Open logs',130);
  } else {
    // Rows
    const rows=[
      ['2020 RAV4 XLE','31,900', '41','62k','Exact','18','Above'],
      ['2019 F-150 XLT','38,900','12','68k','Exact','11','At'],
      ['2018 Civic LX','18,900','73','91k','Near','8','Below'],
      ['2021 CR-V EX','— Unknown','—','54k','Exact','6','—'],
    ];
    for(let r=0;r<rows.length;r++){
      const ry=thY+40+r*44;
      svg += rect(tableX+16,ry,tableW-32,34,'bg');
      svg += strokeRect(tableX+16,ry,tableW-32,34);
      for(let c=0;c<rows[r].length;c++){
        svg += text(tableX+24+colX[c],ry+22,rows[r][c], c===0?'p':'mono');
      }
    }

    // Drilldown hint
    svg += rect(x,cardY+176+16,520, h-(cardY+176+32),'bg');
    svg += strokeRect(x,cardY+176+16,520, h-(cardY+176+32));
    svg += text(x+16,cardY+176+44,'Comp set drilldown (drawer)','h2');
    svg += text(x+16,cardY+176+68,'Shows provenance + adjustments. Exportable.','p ts');
    svg += rect(x+16,cardY+176+84,488,220,'subtle',`rx="12"`);
    svg += text(x+30,cardY+176+116,'Drilldown includes:','b');
    svg += text(x+30,cardY+176+140,'• each comp row with source, distance, DOM, accident history, colors','p ts');
    svg += text(x+30,cardY+176+162,'• match label (Exact/Near) + confidence','p ts');
    svg += text(x+30,cardY+176+184,'• “Recommended band” drivers + auditability','p ts');
    svg += buttonGhost(x+16, h-62-16,'Export CSV',140);
    svg += buttonGhost(x+164, h-62-16,'Export PDF',140);
  }

  svg += svgFooter();
  return svg;
}

function screen_AppraisalComps(state){
  const w=1440,h=900,navW=220,topH=62;
  let svg = appFrame({
    title:'Appraisal + Comps',
    subtitle:'VIN decode confidence, exact-trim comps by default, explainable adjustments.',
    statusChip:'Canada-only sources'
  });
  const x=navW+16,y=topH+16;

  // VIN card
  svg += rect(x,y,520,164,'bg');
  svg += strokeRect(x,y,520,164);
  svg += text(x+16,y+28,'VIN decode','h2');
  svg += rect(x+16,y+46,488,36,'subtle',`rx="10"`);
  svg += text(x+30,y+70,'Enter VIN…','p ts');
  svg += buttonPrimary(x+520-120-16,y+50,'Decode',90);
  svg += chip(x+16,y+94,'Confidence: High');
  svg += text(x+16,y+122,'Decoded: 2020 Toyota RAV4 XLE AWD · 2.5L','p');
  svg += text(x+16,y+144,'Options: Heated seats, Moonroof (partial) · Explain →','p ts');

  // Controls
  const ctrlX=x+520+16;
  const ctrlW=w-navW-32-520-16;
  svg += rect(ctrlX,y,ctrlW,164,'bg');
  svg += strokeRect(ctrlX,y,ctrlW,164);
  svg += text(ctrlX+16,y+28,'Search controls','h2');
  svg += chip(ctrlX+16,y+46,'Radius: 0–250km');
  svg += chip(ctrlX+150,y+46,'Exact trim (default)');
  svg += chip(ctrlX+320,y+46,'Near-trim: OFF');
  svg += text(ctrlX+16,y+86,'Adjustments apply on top of comps (mileage tolerance ignored by spec).','p ts');
  svg += buttonGhost(ctrlX+16,y+108,'Add adjustment',150);
  svg += buttonPrimary(ctrlX+ctrlW-160-16,y+108,'Fetch comps',140);

  // Comps list
  const listY=y+164+16;
  svg += rect(x,listY,w-navW-32, h-listY-16,'bg');
  svg += strokeRect(x,listY,w-navW-32, h-listY-16);
  svg += text(x+16,listY+28,'Comps','h2');
  svg += text(x+16,listY+52,'Why these comps? Exact-trim match first; near-trim optional with labeling.','p ts');

  if(state==='loading'){
    for(let r=0;r<8;r++){
      const ry=listY+74+r*64;
      svg += rect(x+16,ry,w-navW-64,48,'muted',`rx="10"`);
      svg += rect(x+16,ry+54,w-navW-220,10,'muted',`rx="5"`);
    }
    svg += text(x+16,listY+86,'Loading comps…','b tm');
  } else if(state==='empty'){
    svg += rect(x+16,listY+88,w-navW-64,170,'subtle',`rx="12"`);
    svg += text(x+40,listY+132,'No comps found in this radius','h2');
    svg += text(x+40,listY+158,'Try a wider radius or enable Near-trim (labels will show match quality).','p ts');
    svg += buttonGhost(x+40,listY+178,'Set radius to 500km',190);
    svg += buttonGhost(x+240,listY+178,'Enable Near-trim',190);
  } else if(state==='error'){
    svg += rect(x+16,listY+88,w-navW-64,170,'subtle',`rx="12"`);
    svg += text(x+40,listY+132,'Comps fetch failed','h2');
    svg += text(x+40,listY+158,'API/scrape error. Your VIN decode is saved; retry or open logs.','p ts');
    svg += buttonPrimary(x+40,listY+182,'Retry',110);
    svg += buttonGhost(x+160,listY+182,'Open logs',140);
  } else {
    const rows=[
      {title:'2020 RAV4 XLE AWD', price:'$31,800', dist:'14km', match:'Exact', why:'Same trim + AWD + similar km; clean history', adj:'+0'},
      {title:'2020 RAV4 XLE AWD', price:'$32,200', dist:'38km', match:'Exact', why:'Same trim; minor color diff', adj:'-150'},
      {title:'2020 RAV4 LE AWD',  price:'$29,900', dist:'22km', match:'Near',  why:'Lower trim; used for banding only', adj:'-900'},
    ];
    for(let r=0;r<rows.length;r++){
      const ry=listY+78+r*92;
      svg += rect(x+16,ry,w-navW-64,78,'subtle',`rx="12"`);
      svg += text(x+32,ry+28,rows[r].title,'b');
      svg += chip(x+32,ry+36,`Match: ${rows[r].match}`);
      svg += text(x+32,ry+66,`Why: ${rows[r].why}`,'p ts');
      svg += text(x+w-260,ry+30,rows[r].price,'h2');
      svg += text(x+w-260,ry+54,`${rows[r].dist} · Adj ${rows[r].adj}`,'mono ts');
    }

    // Explainability drawer hint
    svg += rect(x+16,h-128,w-navW-64,96,'callout',`rx="12"`);
    svg += text(x+32,h-98,'Explainability','b');
    svg += text(x+32,h-78,'Each comp row opens a drawer: source page snapshot, field confidence, and applied adjustments.','p ts');
  }

  svg += svgFooter();
  return svg;
}

function screen_CraigslistReview(state){
  const w=1440,h=900,navW=220,topH=62;
  let svg = appFrame({
    title:'Craigslist Assist — Review',
    subtitle:'Prefill preview + validation. LotView will not click Publish.',
    statusChip:'Extension: Connected'
  });
  const x=navW+16,y=topH+16;

  // Left: preview
  const leftW=820;
  svg += rect(x,y,leftW, h-y-16,'bg');
  svg += strokeRect(x,y,leftW, h-y-16);
  svg += text(x+16,y+28,'Prefill preview','h2');
  svg += rect(x+16,y+48,leftW-32,92,'subtle',`rx="12"`);
  svg += text(x+32,y+76,'Title: 2019 Ford F-150 XLT — Clean, Local, Ready','p');
  svg += text(x+32,y+98,'Price: $38,900 · Category: cars+trucks by dealer','p');
  svg += text(x+32,y+120,'Region: Surrey BC · Posting area: Vancouver / Lower Mainland','p ts');

  svg += rect(x+16,y+156,leftW-32,210,'subtle',`rx="12"`);
  svg += text(x+32,y+186,'Photos (drag to reorder)','b');
  for(let i=0;i<8;i++){
    const px = x+32 + (i%4)*188;
    const py = y+200 + Math.floor(i/4)*78;
    svg += rect(px,py,172,62,'bg');
    svg += strokeRect(px,py,172,62);
    svg += text(px+10,py+36,`Photo ${i+1}`,'p ts');
  }

  svg += rect(x+16,y+382,leftW-32, h-y-16-382-16,'subtle',`rx="12"`);
  svg += text(x+32,y+412,'Description preview','b');
  svg += text(x+32,y+436,'• Sharp unit. Clean history (if known).','p');
  svg += text(x+32,y+456,'• Key features pulled from VDP (no hype, no promises).','p');
  svg += text(x+32,y+476,'• CTA: Call/text to book a time today.','p');
  svg += text(x+32,y+506,'(Full text in editor on Craigslist form)','p ts');

  // Right: checklist + errors
  const rightX = x+leftW+16;
  const rightW = w-navW-32-leftW-16;
  svg += rect(rightX,y,rightW, h-y-16,'bg');
  svg += strokeRect(rightX,y,rightW, h-y-16);
  svg += text(rightX+16,y+28,'Publish-ready checklist','h2');
  svg += text(rightX+16,y+52,'LotView will not click Publish. You review then publish.','p ts');

  function checkItem(yy,label,ok=true,detail=''){
    const icon = ok ? '✓' : '!';
    const fg = ok ? colors.success : colors.danger;
    return `<text x="${rightX+18}" y="${yy}" class="t b" fill="${fg}">${icon}</text>`+
      text(rightX+36,yy,label,'p')+
      (detail ? text(rightX+36,yy+18,detail,'p ts') : '');
  }

  if(state==='loading'){
    svg += rect(rightX+16,y+76,rightW-32,140,'muted',`rx="12"`);
    svg += text(rightX+28,y+122,'Validating fields…','b tm');
  } else if(state==='empty'){
    svg += rect(rightX+16,y+76,rightW-32,160,'subtle',`rx="12"`);
    svg += text(rightX+28,y+118,'No draft detected','h2');
    svg += text(rightX+28,y+144,'Open the Craigslist form and click “Assist” to prefill this unit.','p ts');
    svg += buttonPrimary(rightX+28,y+166,'How to start',150);
  } else if(state==='error'){
    svg += rect(rightX+16,y+76,rightW-32,210,'subtle',`rx="12"`);
    svg += text(rightX+28,y+118,'Validation blocked','h2');
    svg += text(rightX+28,y+144,'Login/captcha/selector drift detected. Automation is paused.','p ts');
    svg += buttonPrimary(rightX+28,y+170,'Retry detect',140);
    svg += buttonGhost(rightX+180,y+170,'View diagnostics',160);
    svg += chip(rightX+28,y+210,'State: PAUSED');
  } else {
    const baseY=y+96;
    svg += checkItem(baseY,'Photos uploaded',true,'8/8');
    svg += checkItem(baseY+46,'Category selected',true,'cars+trucks by dealer');
    svg += checkItem(baseY+92,'Region set',true,'Surrey BC');
    svg += checkItem(baseY+138,'Required fields complete',true,'Price, title, location');
    svg += checkItem(baseY+184,'No policy blocks',true,'No prohibited terms');

    svg += rect(rightX+16,y+320,rightW-32,220,'subtle',`rx="12"`);
    svg += text(rightX+28,y+350,'Errors & warnings','b');
    svg += text(rightX+28,y+374,'None. You are ready to publish on Craigslist.','p ts');

    svg += rect(rightX+16,y+560,rightW-32,170,'callout',`rx="12"`);
    svg += text(rightX+28,y+590,'Final step (human)','b');
    svg += text(rightX+28,y+614,'1) Confirm preview on Craigslist','p');
    svg += text(rightX+28,y+636,'2) Click Publish yourself','p');
    svg += text(rightX+28,y+658,'3) LotView logs the attempt + result','p');
  }

  svg += svgFooter();
  return svg;
}

// ---------- Flows ----------

function flowSvg({title,steps}){
  const w=1400,h=820;
  let svg = svgHeader({w,h,title})+rect(0,0,w,h,'bg');
  svg += text(24,40,title,'h1');
  svg += text(24,64,'Flows show main path + guardrails (pause/blocked/escalation) with audit hooks.','p ts');

  const startX=60, startY=120, boxW=290, boxH=86, gapX=34, gapY=34;
  function box(x,y,label,sub,kind='normal'){
    const fill = kind==='danger' ? '#FFF5F5' : kind==='warn' ? '#FFFAF0' : '#F7FAFC';
    const stroke = kind==='danger' ? colors.danger : kind==='warn' ? colors.warning : colors.borderStrong;
    return `<rect x="${x}" y="${y}" width="${boxW}" height="${boxH}" rx="14" fill="${fill}" stroke="${stroke}" stroke-width="1"/>`+
      text(x+16,y+30,label,'b')+
      text(x+16,y+54,sub,'p ts');
  }
  function arrow(x1,y1,x2,y2){
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${colors.textMuted}" stroke-width="2" marker-end="url(#arrow)"/>`;
  }

  svg += `<defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L6,3 z" fill="${colors.textMuted}"/></marker></defs>`;

  // Layout: steps in two rows
  const positions = steps.map((s,i)=>{
    const row = i<4 ? 0 : 1;
    const idx = row===0 ? i : i-4;
    return {x:startX + idx*(boxW+gapX), y:startY + row*(boxH+gapY+120)};
  });

  steps.forEach((s,i)=>{
    const {x,y}=positions[i];
    svg += box(x,y,s.label,s.sub,s.kind);
    if(i<steps.length-1){
      const {x:xx,y:yy}=positions[i+1];
      // if next wraps row, arrow down then left
      if(yy!==y){
        svg += arrow(x+boxW/2,y+boxH, x+boxW/2, yy-14);
        svg += arrow(x+boxW/2,yy-14, xx+boxW/2, yy-14);
        svg += arrow(xx+boxW/2,yy-14, xx+boxW/2, yy);
      } else {
        svg += arrow(x+boxW, y+boxH/2, xx, yy+boxH/2);
      }
    }
  });

  // Legend
  svg += rect(24,h-118, 540, 86,'subtle',`rx="14" stroke="${colors.borderStrong}" stroke-width="1"`);
  svg += text(44,h-88,'Legend','b');
  svg += `<rect x="44" y="${h-72}" width="18" height="18" rx="4" fill="#F7FAFC" stroke="${colors.borderStrong}"/>`;
  svg += text(70,h-58,'Normal step','p ts');
  svg += `<rect x="200" y="${h-72}" width="18" height="18" rx="4" fill="#FFFAF0" stroke="${colors.warning}"/>`;
  svg += text(226,h-58,'Paused / needs human','p ts');
  svg += `<rect x="390" y="${h-72}" width="18" height="18" rx="4" fill="#FFF5F5" stroke="${colors.danger}"/>`;
  svg += text(416,h-58,'Blocked / safety stop','p ts');

  svg += svgFooter();
  return {w,h,svg};
}

function flows(){
  return {
    'fb-inbox__flow': flowSvg({
      title:'FB Marketplace Inbox — End-to-end reply flow',
      steps:[
        {label:'Inbound message ingested', sub:'Extension DOM bridge → backend store', kind:'normal'},
        {label:'Lead + vehicle mapped', sub:'Extract lead name + map to unit (confidence gated)', kind:'normal'},
        {label:'Policy decision', sub:'Allowlist/denylist + business hours + anti-loop', kind:'normal'},
        {label:'Auto-send or queue', sub:'Auto-send if all gates pass; else “needs approval”', kind:'warn'},
        {label:'Typing simulation', sub:'Countdown + abort; stops on drift/focus loss', kind:'normal'},
        {label:'Send via UI automation', sub:'Extension sends message; detects action-block', kind:'normal'},
        {label:'Audit log written', sub:'Mode + why + confidence + typing duration', kind:'normal'},
      ]
    }),
    'automation-settings__flow': flowSvg({
      title:'Automation Settings — policy change flow',
      steps:[
        {label:'Manager opens Settings', sub:'RBAC: GM/Manager only', kind:'normal'},
        {label:'Edit thresholds/hours', sub:'Inline preview of impact + defaults', kind:'normal'},
        {label:'Validate policy', sub:'Detect contradictions; warn if risky', kind:'warn'},
        {label:'Save + apply', sub:'Policy version increments', kind:'normal'},
        {label:'Audit entry created', sub:'Who changed what + before/after', kind:'normal'},
      ]
    }),
    'competitive-report__flow': flowSvg({
      title:'Competitive Report — snapshot to drilldown',
      steps:[
        {label:'Worker runs snapshot', sub:'Every 48h; API-first + ZenRows fallback', kind:'normal'},
        {label:'Dashboard shows freshness', sub:'Last run + cached vs fresh chips', kind:'normal'},
        {label:'Filter by radius tiers', sub:'0–25 / 25–50 / 50–100 / 100+ km', kind:'normal'},
        {label:'Select unit', sub:'Inventory row opens comp set', kind:'normal'},
        {label:'Comp drilldown', sub:'Provenance + fields + unknowns explicit', kind:'normal'},
        {label:'Export', sub:'CSV/PDF; includes confidence + timestamp', kind:'normal'},
      ]
    }),
    'appraisal-comps__flow': flowSvg({
      title:'Appraisal/Comps — VIN to valuation',
      steps:[
        {label:'Enter VIN', sub:'Decode baseline always', kind:'normal'},
        {label:'Decode confidence', sub:'High/Med/Low; low blocks auto decisions', kind:'warn'},
        {label:'Exact trim comps', sub:'Default: exact; near-trim optional', kind:'normal'},
        {label:'Explainability', sub:'Why comps selected + adjustments applied', kind:'normal'},
        {label:'Save appraisal', sub:'Store comps + adjustments + audit', kind:'normal'},
      ]
    }),
    'craigslist-assist__flow': flowSvg({
      title:'Craigslist Assist — assisted autopost',
      steps:[
        {label:'User clicks Assist', sub:'Extension detects form + region', kind:'normal'},
        {label:'Prefill + upload photos', sub:'Fills fields; reorders photos', kind:'normal'},
        {label:'Review step', sub:'Show checklist + validation errors', kind:'normal'},
        {label:'Stop before publish', sub:'LotView never clicks Publish', kind:'warn'},
        {label:'Log result', sub:'Attempt + validation + outcome', kind:'normal'},
      ]
    }),
  };
}

// ---------- Build + render ----------

const wireframes = {
  'fb-inbox': screen_FBInbox,
  'automation-settings': screen_AutomationSettings,
  'competitive-report-dashboard': screen_CompetitiveDashboard,
  'appraisal-comps': screen_AppraisalComps,
  'craigslist-assist-review': screen_CraigslistReview,
};

const states = ['main','loading','empty','error'];

async function ensureDir(p){ await fs.mkdir(p,{recursive:true}); }

async function writeSvg(outPath, svg){
  await fs.writeFile(outPath, svg, 'utf8');
}

async function renderSvgToPng({browser, svg, pngPath, width, height}){
  const page = await browser.newPage();
  await page.setViewport({width, height, deviceScaleFactor: 2});
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"/>
    <style>html,body{margin:0;padding:0;background:#fff;}</style></head>
    <body>${svg}</body></html>`);
  await page.screenshot({path: pngPath, type:'png'});
  await page.close();
}

async function main(){
  const wfSrcDir = path.join(ROOT,'wireframes','_src');
  const wfOutDir = path.join(ROOT,'wireframes');
  const flowSrcDir = path.join(ROOT,'flows','_src');
  const flowOutDir = path.join(ROOT,'flows');
  await ensureDir(wfSrcDir);
  await ensureDir(flowSrcDir);

  const browser = await puppeteer.launch({headless:'new'});

  // Wireframes
  for(const [key,fn] of Object.entries(wireframes)){
    for(const st of states){
      const svg = fn(st==='main' ? 'main' : st);
      const svgPath = path.join(wfSrcDir, `${key}__${st}.svg`);
      const pngPath = path.join(wfOutDir, `${key}__${st}.png`);
      await writeSvg(svgPath, svg);
      await renderSvgToPng({browser, svg, pngPath, width:1440, height:900});
    }
  }

  // Flows
  const flowMap = flows();
  for(const [name,obj] of Object.entries(flowMap)){
    const svgPath = path.join(flowSrcDir, `${name}.svg`);
    const pngPath = path.join(flowOutDir, `${name}.png`);
    await writeSvg(svgPath, obj.svg);
    await renderSvgToPng({browser, svg: obj.svg, pngPath, width:obj.w, height:obj.h});
  }

  await browser.close();

  // Write a tiny index for quick viewing
  const indexPath = path.join(ROOT,'_render','EXPORT_INDEX.md');
  const wfLines = Object.keys(wireframes).flatMap(k => states.map(st => `- ${path.join('wireframes',`${k}__${st}.png`)}`));
  const flowLines = Object.keys(flowMap).map(n => `- ${path.join('flows',`${n}.png`)}`);
  await fs.writeFile(indexPath, `# Automation Overhaul — Export Index\n\n## Wireframes (PNG)\n${wfLines.join('\n')}\n\n## Flows (PNG)\n${flowLines.join('\n')}\n`, 'utf8');
}

main().catch((err)=>{ console.error(err); process.exit(1); });
