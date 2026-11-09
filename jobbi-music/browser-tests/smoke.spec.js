import {test,expect} from '@playwright/test';

async function setupMocks(page){
  const state={session:null,playlists:[{id:'p1',name:'Favorites Mix',songCount:0}],musicRequests:[],imports:[],fallbackJobs:[]};
  await page.route('**/api/**',async route=>{
    const req=route.request();
    const url=new URL(req.url());
    const method=req.method();
    const pathname=url.pathname;
    const body=(()=>{try{return req.postDataJSON()||{}}catch{return {}}})();
    const reply=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
    if(pathname.startsWith('/api/invidious/thumbnail/'))return route.fulfill({status:404,body:''});
    if(pathname.startsWith('/api/cover/'))return route.fulfill({status:404,body:''});
    if(pathname.startsWith('/api/stream/'))return route.fulfill({status:200,contentType:'audio/mpeg',body:''});
    if(pathname==='/api/session')return reply(state.session);
    if(pathname==='/api/login'){const isAdmin=body.username==='testadmin';state.session={username:body.username,admin:isAdmin,csrfToken:'test-csrf-token'};return reply(state.session);}
    if(pathname==='/api/logout'){state.session=null;return reply({ok:true});}
    if(pathname==='/api/home')return reply({recent:[{id:'a1',name:'Test Album',artist:'Test Artist'}],featured:[],played:[],songs:[{id:'s1',title:'Kino',artist:'Test Artist',duration:180}],playlists:state.playlists});
    if(pathname==='/api/starred')return reply({song:[],album:[]});
    if(pathname==='/api/lyrics/s1')return reply({available:true,synced:true,source:'Navidrome',lines:[{at:0,text:'First line of the song'},{at:4500,text:'Second line of the song'}]});
    if(pathname==='/api/search')return reply({artist:[{id:'artist1',name:'Test Artist'}],album:[{id:'a1',name:'Test Album',artist:'Test Artist'}],song:[{id:'s1',title:'Kino',artist:'Test Artist',artistId:'artist1',albumId:'a1',album:'Test Album',duration:180}]});
    if(pathname==='/api/library/albums')return reply({albums:[{id:'a1',name:'Test Album',artist:'Test Artist'}],offset:0,size:48});
    if(pathname==='/api/library/artists')return reply({artists:[{id:'artist1',name:'Test Artist'}],count:1});
    if(pathname==='/api/albums/a1')return reply({id:'a1',name:'Test Album',artist:'Test Artist',song:[{id:'s1',title:'Kino',artist:'Test Artist',artistId:'artist1',albumId:'a1',album:'Test Album',duration:180}]});
    if(pathname==='/api/artists/artist1')return reply({id:'artist1',name:'Test Artist',album:[{id:'a1',name:'Test Album'}],song:[{id:'s1',title:'Kino',artist:'Test Artist',artistId:'artist1',albumId:'a1',album:'Test Album',duration:180}]});
    if(pathname==='/api/playlists'&&method==='GET')return reply(state.playlists);
    if(pathname==='/api/playlists'&&method==='POST'){state.playlists.push({id:'p2',name:body.name,songCount:0});return reply({playlist:state.playlists.at(-1)},201);}

    if(pathname==='/api/music-requests'&&method==='GET')return reply({requests:state.musicRequests.filter(x=>x.requester===state.session?.username)});
    if(pathname==='/api/music-requests/admin'&&method==='GET')return reply({requests:state.musicRequests});
    if(pathname==='/api/music-requests'&&method==='POST'){
      const item={...body,id:'request-'+(state.musicRequests.length+1),requester:state.session?.username,status:'pending'};
      state.musicRequests.unshift(item);
      return reply({requested:true,request:item},201);
    }
    if(pathname.startsWith('/api/music-requests/')&&pathname.endsWith('/decision')&&method==='POST'){
      const id=pathname.split('/')[3],item=state.musicRequests.find(x=>x.id===id);
      if(!item)return reply({error:'Request not found'},404);
      item.status=body.decision==='approve'?'queued':'rejected';
      return reply({status:item.status,request:item},body.decision==='approve'?202:200);
    }
    if(pathname==='/api/music-imports'&&method==='GET')return reply({items:state.imports});
    if(pathname==='/api/music-imports'&&method==='POST'){
      const item={...body,id:'import-'+(state.imports.length+1),status:'queued'};
      state.imports.unshift(item);return reply({queued:true,importId:item.id},202);
    }
    if(pathname==='/api/invidious/status')return reply({configured:true,importEnabled:true});
    if(pathname==='/api/invidious/jobs')return reply({jobs:state.fallbackJobs});
    if(pathname==='/api/invidious/search')return reply({source:'invidious',available:true,instance:'https://yt.jobbisoft.com.mx',results:[
      {videoId:'dQw4w9WgXcQ',title:'Luis Miguel - Test Music',artist:'Example channel',duration:180,url:'https://yt.jobbisoft.com.mx/watch?v=dQw4w9WgXcQ',thumbnail:'/api/invidious/thumbnail/dQw4w9WgXcQ'}
    ]});
    if(pathname==='/api/invidious/import'&&method==='POST'){
      const job={id:'fallback-'+(state.fallbackJobs.length+1),...body,status:'queued'};
      state.fallbackJobs.push(job);return reply({queued:true,jobId:job.id},202);
    }
    if(pathname==='/api/soulseek/status')return reply({mode:'slskd',configured:true,serverConnected:true});
    if(pathname==='/api/soulseek/search')return reply({source:'slskd',results:[{username:'peer1',filename:'Kino/Кино - Группа крови.flac',size:28000000,format:'FLAC',bitrate:950,freeUploadSlot:true,relevanceScore:290}],total:1,peerCount:1,elapsedMs:2300});
    if(pathname==='/api/soulseek/downloads')return reply({jobs:[]});
    if(pathname==='/api/soulseek/download')return reply({queued:true,details:{job_id:'test'}},202);
    if(pathname==='/api/admin/overview')return reply({storage:{status:'ready',musicBytes:1024*1024*1024,usedBytes:6*1024*1024*1024,freeBytes:20*1024*1024*1024,totalBytes:26*1024*1024*1024,files:312,checkedAt:new Date().toISOString()},usersCount:2,accountManagementEnabled:true,directSearchConfigured:true,httpsOnlyCookies:true});
    if(pathname==='/api/admin/accounts'&&method==='GET')return reply({users:[{id:'u1',username:'testadmin',name:'Admin',isAdmin:true},{id:'u2',username:'listener',name:'Listener',isAdmin:false}],readOnly:false});
    if(pathname==='/api/admin/accounts'&&method==='POST')return reply({created:true,username:body.username,role:'listener'},201);
    if(pathname.startsWith('/api/admin/accounts/')&&method==='DELETE')return reply({deleted:true});
    if(pathname==='/api/library/scan')return reply({ok:true,scanStatus:{scanning:true}});
    if(pathname==='/api/status')return reply({ok:true});
    return reply({ok:true});
  });
  return state;
}
async function login(page,username){
  await page.goto('/');
  await page.getByPlaceholder('Your username').fill(username);
  await page.getByPlaceholder('Your password').fill('example-test-password');
  await page.getByRole('button',{name:/Sign in to Jobbi Music/}).click();
  await expect(page.getByText('Play something good')).toBeVisible();
}
async function navigate(page,label){
  const mobile=page.locator('.mobile-nav').first();
  if(await mobile.isVisible()){await mobile.getByRole('button',{name:label,exact:true}).click();}
  else{await page.locator('.sidebar').getByRole('button',{name:label,exact:true}).click();}
}
test('listener can sign in, browse, search and manage own playlist without admin access',async({page})=>{
  const errors=[];page.on('pageerror',err=>errors.push(err.message));
  await setupMocks(page);await login(page,'listener');
  await expect(page.getByRole('button',{name:/Admin console/})).toHaveCount(0);
  await navigate(page,'Discover');
  await page.getByPlaceholder('Songs, artists, albums...').fill('Kino');
  await expect(page.getByText('Kino',{exact:true}).first()).toBeVisible();
  await navigate(page,'Your Library');
  await expect(page.getByText('Test Album').first()).toBeVisible();
  await page.getByPlaceholder('Give your playlist a name').fill('Road Trip');
  await page.getByRole('button',{name:'Create',exact:true}).click();
  await expect(page.locator('.playlist-grid').getByRole('button',{name:/Road Trip/})).toBeVisible();
  expect(errors).toEqual([]);
});
test('administrator sees volume stats and restricted user management',async({page})=>{
  const errors=[];page.on('pageerror',err=>errors.push(err.message));
  await setupMocks(page);await login(page,'testadmin');
  if(await page.locator('.mobile-nav').first().isVisible()){
    await page.getByRole('button',{name:'More options'}).click();
    await page.locator('.mobile-more-sheet').getByRole('button',{name:'Admin console'}).click();
  }else await navigate(page,'Admin console');
  await expect(page.getByText('NAS storage')).toBeVisible();
  await expect(page.getByText('Accounts & permissions')).toBeVisible();
  await expect(page.getByText('Listener',{exact:true}).first()).toBeVisible();
  await page.getByRole('button',{name:'Create listener'}).click();
  await expect(page.getByText('Username must')).toHaveCount(0);
  expect(errors).toEqual([]);
});
test('Soulseek search presents peer results instead of raw JSON',async({page})=>{
  const errors=[];page.on('pageerror',err=>errors.push(err.message));
  await setupMocks(page);await login(page,'testadmin');
  await navigate(page,'Discover');
  await page.getByPlaceholder('Songs, artists, albums...').fill('Kino');
  await page.getByRole('button',{name:/Soulseek · New music/}).click();
  await page.getByRole('button',{name:'Search music sources'}).click();
  await expect(page.getByText('Music from Soulseek')).toBeVisible();
  await expect(page.getByText('Кино - Группа крови.flac')).toBeVisible();
  await page.getByRole('button',{name:'Import song'}).click();
  await expect(page.getByText('Add to your library')).toBeVisible();
  expect(errors).toEqual([]);
});


async function mockSocial(page){
  const state={
    me:{username:'listener',display_name:'Listener',bio:'',discoverable:true,blend_opt_in:false,has_avatar:false},
    friends:[{username:'bob',display_name:'Bob',blend_opt_in:true,has_avatar:false}],
    incoming:[{username:'cathy',display_name:'Cathy'}],outgoing:[],
    playlists:[],discover:[{id:'00000000-0000-0000-0000-000000000111',title:'Public jams',description:'Come listen',owner:'bob',visibility:'public',kind:'manual',song_count:2}],
    details:{},status:{}
  };
  await page.route('**/api/social/**',async route=>{
    const req=route.request(),url=new URL(req.url()),path=url.pathname.replace('/api/social',''),method=req.method();
    const body=(()=>{try{return req.postDataJSON()||{}}catch{return {}}})();
    const reply=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
    if(path==='/home'&&method==='GET')return reply({...state});
    if(path==='/people'&&method==='GET')return reply({users:[{username:'chris',display_name:'Chris',has_avatar:false}]});
    if(path.startsWith('/profiles/')&&path.endsWith('/avatar'))return route.fulfill({status:404,body:''});
    if(path.startsWith('/profiles/')&&method==='GET'){
      const username=path.split('/')[2];const self=username==='listener';
      const p=self?state.me:{username,display_name:username,bio:'',discoverable:true,has_avatar:false};
      return reply({profile:p,isFriend:username==='bob',stats:{playlists_created:1,songs_added:2},playlists:state.playlists.filter(p=>p.owner===username)});
    }
    if(path==='/me'&&method==='PATCH'){state.me={...state.me,display_name:body.displayName??state.me.display_name,bio:body.bio??state.me.bio,discoverable:body.discoverable??state.me.discoverable};return reply({profile:state.me});}
    if(path==='/me/avatar'&&method==='POST'){state.me.has_avatar=true;return reply({saved:true});}
    if(path==='/me/avatar'&&method==='DELETE'){state.me.has_avatar=false;return reply({removed:true});}
    if(path==='/friends/request'&&method==='POST'){state.outgoing.push({username:body.username,display_name:body.username});return reply({requested:true},201);}
    if(path.startsWith('/friends/')&&path.endsWith('/respond')&&method==='POST'){
      const name=path.split('/')[2];state.incoming=state.incoming.filter(p=>p.username!==name);
      if(body.accept)state.friends.push({username:name,display_name:name,blend_opt_in:false,has_avatar:false});
      return reply({accepted:body.accept});
    }
    if(path.startsWith('/friends/')&&method==='DELETE'){state.friends=state.friends.filter(p=>p.username!==path.split('/')[2]);return reply({unfriended:true});}
    if(path==='/playlists'&&method==='POST'){
      const p={id:'00000000-0000-0000-0000-000000000123',title:body.title,description:body.description||'',visibility:body.visibility,kind:'manual',owner:'listener',song_count:0};
      state.playlists.unshift(p);state.details[p.id]={playlist:p,tracks:[],members:[]};return reply({playlist:p},201);
    }
    if(path==='/playlists/import'&&method==='POST'){
      const p={id:'00000000-0000-0000-0000-000000000124',title:'My imported mix',description:'Imported',visibility:'private',kind:'manual',owner:'listener',song_count:1};
      state.playlists.unshift(p);state.details[p.id]={playlist:p,tracks:[{id:'1',track_id:'s1',title:'Kino',artist:'Test Artist',added_by:'listener'}],members:[]};
      return reply({id:p.id,imported:1},201);
    }
    if(path.startsWith('/playlists/')&&method==='GET'){
      const id=path.split('/')[2];return reply(state.details[id]||{playlist:{...state.discover[0]},tracks:[],members:[]});
    }
    if(path.startsWith('/playlists/')&&method==='PATCH'){
      const id=path.split('/')[2];const d=state.details[id];if(d){d.playlist={...d.playlist,...body};state.playlists=state.playlists.map(p=>p.id===id?d.playlist:p);}
      return reply({playlist:d?.playlist});
    }
    if(path.startsWith('/playlists/')&&path.endsWith('/members')&&method==='POST'){
      const id=path.split('/')[2];state.details[id]?.members.push({username:body.username,can_edit:body.canEdit});return reply({shared:true});
    }
    if(path.startsWith('/playlists/')&&path.endsWith('/tracks')&&method==='POST'){
      const id=path.split('/')[2];state.details[id]?.tracks.push({id:'12',track_id:body.trackId,title:'Kino',artist:'Test Artist',added_by:'listener'});return reply({added:true},201);
    }
    if(path.startsWith('/playlists/')&&method==='DELETE')return reply({deleted:true});
    if(path==='/blend/picks'&&method==='POST'){state.me.blend_opt_in=true;return reply({optedIn:true,contributed:3});}
    if(path==='/blend/picks'&&method==='DELETE'){state.me.blend_opt_in=false;return reply({optedOut:true});}
    if(path==='/blends'&&method==='POST'){
      const p={id:'00000000-0000-0000-0000-000000000125',title:'Blend · listener + bob',visibility:'private',kind:'blend',owner:'listener',song_count:2};
      state.playlists.unshift(p);state.details[p.id]={playlist:p,tracks:[{id:'1',track_id:'s1',title:'Kino',artist:'Test Artist',added_by:'listener'}],members:[{username:'bob',can_edit:false}]};
      return reply({id:p.id,count:2},201);
    }
    if(path.startsWith('/blends/')&&path.endsWith('/refresh'))return reply({updated:true,count:2});
    return reply({error:'Not mocked'},404);
  });
}
test('Community connects friends, public discovery, and listener-created shared playlists',async({page})=>{
  const errors=[];page.on('pageerror',err=>errors.push(err.message));
  await setupMocks(page);await mockSocial(page);await login(page,'listener');
  await navigate(page,'Community');
  await expect(page.getByText('Music is better')).toBeVisible();
  await expect(page.getByRole('button',{name:/Public jams/})).toBeVisible();
  await page.getByRole('button',{name:'Playlists',exact:true}).last().click();
  await page.getByPlaceholder('Our favorite songs').fill('Our roadtrip');
  await page.getByRole('button',{name:'Create playlist'}).click();
  await expect(page.getByRole('heading',{name:'Our roadtrip'})).toBeVisible();
  await page.getByLabel('Privacy').selectOption('public');
  await page.getByRole('button',{name:'Save playlist'}).click();
  await expect(page.getByText('Public to signed-in users')).toBeVisible();
  await page.getByLabel('Find songs to add').fill('Kino');
  await page.locator('.social-addsong').getByRole('button',{name:'',exact:true}).first().click();
  await expect(page.getByText('Kino',{exact:true}).first()).toBeVisible();
  expect(errors).toEqual([]);
});
test('Community friend requests, opt-in blends, profile stats and profile picture',async({page})=>{
  const errors=[];page.on('pageerror',err=>errors.push(err.message));
  await setupMocks(page);await mockSocial(page);await login(page,'listener');
  await navigate(page,'Community');
  await page.locator('.social-tabs').getByRole('button',{name:/^Friends/}).click();
  await expect(page.getByText('Cathy',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Accept'}).click();
  await expect(page.getByText('@cathy').first()).toBeVisible();
  await page.getByRole('button',{name:'Blends',exact:true}).click();
  await page.getByRole('button',{name:'Share my favorites for blends'}).click();
  await page.getByLabel('Blend with').selectOption('bob');
  await page.getByRole('button',{name:'Make blend'}).click();
  await expect(page.getByRole('heading',{name:/Blend · listener/})).toBeVisible();
  await page.getByRole('button',{name:'My profile',exact:true}).click();
  await expect(page.getByText('Visible playlists created')).toBeVisible();
  const photo=Buffer.alloc(32);Buffer.from([137,80,78,71,13,10,26,10]).copy(photo);
  await page.locator('.social-avatar-upload input[type=file]').setInputFiles({name:'test.png',mimeType:'image/png',buffer:photo});
  await expect(page.getByText('Profile picture saved')).toBeVisible();
  expect(errors).toEqual([]);
});

test('mobile navigation and Community fit narrow displays without a horizontal page scrollbar',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await setupMocks(page);await mockSocial(page);
  await page.setViewportSize({width:320,height:690});
  await login(page,'listener');
  const noOverflow=async()=>page.evaluate(()=>({width:window.innerWidth,html:document.documentElement.scrollWidth,body:document.body.scrollWidth}));
  const home=await noOverflow();
  expect(home.html).toBeLessThanOrEqual(home.width+1);
  await navigate(page,'Community');
  await expect(page.locator('.social-tabs button')).toHaveCount(5);
  const community=await noOverflow();
  expect(community.html).toBeLessThanOrEqual(community.width+1);
  const inViewport=await page.locator('.social-tabs button').evaluateAll(elements=>elements.every(el=>{
    const b=el.getBoundingClientRect();
    return b.left>=-1&&b.right<=window.innerWidth+1;
  }));
  expect(inViewport).toBe(true);
  await page.getByRole('button',{name:'More options'}).click();
  await expect(page.locator('.mobile-more-sheet')).toBeVisible();
  await page.locator('.mobile-more-sheet').getByRole('button',{name:'Settings'}).click();
  await expect(page.getByText('Streaming quality')).toBeVisible();
  expect(errors).toEqual([]);
});
test('Android native shell hides duplicate web header and keeps all five navigation buttons visible',async({page})=>{
  await setupMocks(page);await mockSocial(page);
  await page.setViewportSize({width:360,height:780});
  await login(page,'listener');
  await page.evaluate(()=>document.documentElement.classList.add('native-android'));
  await expect(page.locator('.topbar')).toBeHidden();
  await expect(page.locator('.mobile-nav>button')).toHaveCount(5);
  const width=await page.evaluate(()=>({vw:window.innerWidth,scroll:document.documentElement.scrollWidth}));
  expect(width.scroll).toBeLessThanOrEqual(width.vw+1);
});

test('tapping playing track opens immersive player, with synced lyrics and queue',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await setupMocks(page);await login(page,'listener');
  await page.getByRole('button',{name:/Play something good/}).click();
  await page.getByRole('button',{name:/Open now playing for Kino/}).click();
  await expect(page.getByRole('dialog',{name:'Now playing'})).toBeVisible();
  await page.getByRole('button',{name:'Show lyrics'}).click();
  await expect(page.getByText('First line of the song')).toBeVisible();
  await expect(page.getByText('Second line of the song')).toBeVisible();
  await page.getByRole('button',{name:'Show queue'}).click();
  await expect(page.getByText('UP NEXT')).toBeVisible();
  await page.getByRole('button',{name:'Track options'}).click();
  await expect(page.getByRole('button',{name:'Add to playlist'}).last()).toBeVisible();
  await page.getByRole('button',{name:'Close now playing'}).click();
  await expect(page.getByRole('dialog',{name:'Now playing'})).toHaveCount(0);
  expect(errors).toEqual([]);
});
test('immersive player fits phone and respects reduced motion',async({page})=>{
  await setupMocks(page);
  await page.setViewportSize({width:320,height:720});
  await page.emulateMedia({reducedMotion:'reduce'});
  await login(page,'listener');
  await page.getByRole('button',{name:/Play something good/}).click();
  await page.getByRole('button',{name:/Open now playing for Kino/}).click();
  const viewport=await page.evaluate(()=>{
    const layer=document.querySelector('.immersive-player');
    return {width:window.innerWidth,scrollWidth:layer.scrollWidth,animation:getComputedStyle(layer).animationName};
  });
  expect(viewport.scrollWidth).toBeLessThanOrEqual(viewport.width+1);
  expect(viewport.animation).toBe('none');
});

test('listener discovers Soulseek and imports directly without admin approval',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await setupMocks(page);await login(page,'listener');
  await navigate(page,'Discover');
  await page.getByPlaceholder('Songs, artists, albums...').fill('Luis Miguel');
  await page.getByRole('button',{name:/Soulseek · New music/}).click();
  await page.getByRole('button',{name:'Search music sources'}).click();
  await expect(page.getByText('Кино - Группа крови.flac')).toBeVisible();
  await page.getByRole('button',{name:'Import song'}).click();
  await page.getByLabel('Artist').fill('Luis Miguel');
  await page.getByLabel('Track title').fill('Test song');
  await page.getByRole('button',{name:'Queue import'}).click();
  await expect(page.getByText('Queued at NAS')).toBeVisible();
  await expect(page.getByText('My NAS imports')).toBeVisible();
  await expect(page.getByText('From Invidious')).toBeVisible();
  expect(errors).toEqual([]);
});
test('listener can import permitted Invidious fallback audio using optional worker',async({page})=>{
  await setupMocks(page);await login(page,'listener');
  await navigate(page,'Discover');
  await page.getByRole('button',{name:/Soulseek · New music/}).click();
  await page.getByPlaceholder('Songs, artists, albums...').fill('Luis Miguel');
  await page.getByRole('button',{name:'Search music sources'}).click();
  await expect(page.getByText('Luis Miguel - Test Music')).toBeVisible();
  await page.getByRole('button',{name:'Import audio'}).click();
  await page.getByRole('checkbox',{name:/I confirm I have permission/}).check();
  await page.getByRole('button',{name:'Import audio to NAS'}).click();
  await expect(page.getByText('Alternate-source imports')).toBeVisible();
  await expect(page.getByText('Queued', {exact:true}).last()).toBeVisible();
});
test('artist and album names in song list open Navidrome catalog pages',async({page})=>{
  await setupMocks(page);await login(page,'listener');
  await navigate(page,'Discover');
  await page.getByPlaceholder('Songs, artists, albums...').fill('Kino');
  await page.getByRole('button',{name:'Test Artist',exact:true}).last().click();
  await expect(page.getByRole('heading',{name:'Test Artist'})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Tracks'})).toBeVisible();
  await page.getByRole('button',{name:'Test Album',exact:true}).last().click();
  await expect(page.getByRole('heading',{name:'Test Album'})).toBeVisible();
});
test('admin sees direct Soulseek import and listener request approvals',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await setupMocks(page);await login(page,'testadmin');
  await navigate(page,'Discover');
  await page.getByRole('button',{name:/Soulseek · New music/}).click();
  await expect(page.getByRole('button',{name:'Search music sources'})).toBeVisible();
  await expect(page.getByText('Listener requests')).toBeVisible();
  await page.getByPlaceholder('Songs, artists, albums...').fill('Kino');
  await page.getByRole('button',{name:'Search music sources'}).click();
  await page.getByRole('button',{name:'Import song'}).click();
  await expect(page.getByRole('heading',{name:'Import song to NAS'})).toBeVisible();
  expect(errors).toEqual([]);
});
