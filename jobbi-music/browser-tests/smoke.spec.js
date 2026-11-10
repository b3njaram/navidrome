import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';

async function setupMocks(page,{staleImports=false,favoriteSongIds=[]}={}){
  const old=staleImports?[{id:'old-1',title:'Группа крови',artist:'Кино',filename:'013. Kino - Gruppa Krovi.mp3',
    stage:'unconfirmed',label:'No active transfer found · this attempt was not confirmed',
    attemptCount:3,archiveIds:['old-1','old-2','old-3'],progress:null}]:[];
  const state={session:null,playlists:[{id:'p1',name:'Favorites Mix',songCount:0}],stars:new Set(favoriteSongIds),addedTracks:[],artworkUploads:[],musicRequests:[],imports:old,fallbackJobs:[]};
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
    if(pathname==='/api/starred')return reply({song:[...state.stars].map(id=>({id,title:'Kino',artist:'Test Artist',duration:180})),album:[]});
    if(pathname==='/api/star'&&method==='POST'){
      if(body.starred)state.stars.add(body.id);else state.stars.delete(body.id);
      return reply({ok:true});
    }
    if(pathname.startsWith('/api/playlists/')&&method==='PATCH'){
      const id=pathname.split('/')[3],p=state.playlists.find(x=>x.id===id);
      if(!p)return reply({error:'Playlist not found'},404);
      if(body.addSongId){state.addedTracks.push({playlistId:id,songId:body.addSongId});p.songCount++;}
      if(typeof body.public==='boolean')p.public=body.public;
      return reply({playlist:{...p}});
    }
    if(pathname==='/api/lyrics/s1')return reply({available:true,synced:true,source:'Navidrome',lines:[{at:0,text:'First line of the song'},{at:4500,text:'Second line of the song'}]});
    if(pathname==='/api/search')return reply({artist:[{id:'artist1',name:'Test Artist'}],album:[{id:'a1',name:'Test Album',artist:'Test Artist'}],song:[{id:'s1',title:'Kino',artist:'Test Artist',artistId:'artist1',albumId:'a1',album:'Test Album',duration:180}]});
    if(pathname==='/api/library/albums')return reply({albums:[{id:'a1',name:'Test Album',artist:'Test Artist'}],offset:0,size:48});
    if(pathname==='/api/library/artists')return reply({artists:[{id:'artist1',name:'Test Artist'}],count:1});
    if(pathname==='/api/albums/a1')return reply({id:'a1',name:'Test Album',artist:'Test Artist',song:[{id:'s1',title:'Kino',artist:'Test Artist',artistId:'artist1',albumId:'a1',album:'Test Album',duration:180}]});
    if(pathname==='/api/artists/artist1')return reply({id:'artist1',name:'Test Artist',album:[{id:'a1',name:'Test Album'}],song:[{id:'s1',title:'Kino',artist:'Test Artist',artistId:'artist1',albumId:'a1',album:'Test Album',duration:180}]});
    if(pathname==='/api/playlists/p1'&&method==='GET')return reply({id:'p1',name:'Favorites Mix',public:state.playlists[0].public||false,entry:[
      {id:'s1',title:'Kino',artist:'Test Artist',duration:180,album:'Test Album'},
      {id:'s2',title:'Another Song',artist:'Other Artist',duration:210,album:'Different Album'}]});
    if(pathname==='/api/playlists/p1/favorite-all'&&method==='POST'){
      state.stars.add('s1');state.stars.add('s2');
      return reply({added:2,skipped:0,failed:0,ids:['s1','s2']});
    }
    if(pathname.startsWith('/api/artwork/')&&method==='POST'){state.artworkUploads.push(pathname);return reply({saved:true});}
    if(pathname.startsWith('/api/artwork/')&&method==='GET')return route.fulfill({status:404,body:''});
    if(pathname==='/api/social/playlists/import'&&method==='POST')return reply({id:'00000000-0000-0000-0000-000000000222',imported:2});
    if(pathname==='/api/social/home')return reply({me:{username:'listener',display_name:'Listener'},friends:[],incoming:[],outgoing:[],playlists:[],discover:[],playlistInvitations:[]});
    if(pathname==='/api/social/playlists/00000000-0000-0000-0000-000000000222')return reply({
      playlist:{id:'00000000-0000-0000-0000-000000000222',title:'Favorites Mix',owner:'listener',description:'Collaborative copy',kind:'manual',visibility:'private'},
      tracks:[],members:[],pendingInvitations:[]
    });
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
    if(pathname==='/api/music-imports'&&method==='GET')return reply({items:state.imports.map(item=>({...item,stage:item.stage||'queued',progress:item.progress??null,label:item.label||'Queued · waiting for Soulseek peer'})),downloaderConnected:true,checkedAt:new Date().toISOString()});
    if(pathname==='/api/music-imports/archive'&&method==='POST'){
      const before=state.imports.length;
      state.imports=state.imports.filter(item=>
        ![item.id,...(item.archiveIds||[])].some(id=>(body.ids||[]).includes(id)));
      return reply({archived:before-state.imports.length,deletedFiles:0,canceledTransfers:0});
    }
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
  await expect(page.getByRole('heading',{name:'Import song to NAS'})).toBeVisible();
  expect(errors).toEqual([]);
});


async function mockSocial(page,{initialInvite=false}={}){
  const state={
    me:{username:'listener',display_name:'Listener',bio:'',discoverable:true,blend_opt_in:false,has_avatar:false},
    friends:[{username:'bob',display_name:'Bob',blend_opt_in:true,has_avatar:false}],
    incoming:[{username:'cathy',display_name:'Cathy'}],outgoing:[],
    playlists:[],playlistInvitations:initialInvite?[{id:'00000000-0000-0000-0000-000000000777',playlist_id:'00000000-0000-0000-0000-000000000778',title:'Shared with Listener',sender:'bob',can_edit:true}]:[],
    discover:[{id:'00000000-0000-0000-0000-000000000111',title:'Public jams',description:'Come listen',owner:'bob',visibility:'public',kind:'manual',song_count:2}],
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
    if(path.startsWith('/invitations/')&&path.endsWith('/respond')&&method==='POST'){
      const id=path.split('/')[2],invite=state.playlistInvitations.find(x=>x.id===id);
      if(!invite)return reply({error:'Not found'},404);
      state.playlistInvitations=state.playlistInvitations.filter(x=>x.id!==id);
      if(body.accept){
        const p={id:invite.playlist_id,title:invite.title,description:'',visibility:'private',kind:'manual',owner:invite.sender,song_count:0};
        state.playlists.push(p);
        state.details[p.id]={playlist:p,tracks:[],members:[{username:'listener',can_edit:invite.can_edit}]};
      }
      return reply({accepted:body.accept,playlistId:invite.playlist_id,canEdit:invite.can_edit});
    }
    if(path.startsWith('/playlists/')&&path.endsWith('/invitations')&&method==='POST'){
      const id=path.split('/')[2],invitation={id:'invite-'+Date.now(),recipient:body.username,can_edit:body.canEdit};
      state.details[id]?.pendingInvitations.push(invitation);
      return reply({invited:true,invitation:{id:invitation.id,username:body.username,canEdit:body.canEdit}},201);
    }
    if(path.startsWith('/playlists/')&&path.includes('/invitations/')&&method==='DELETE'){
      const id=path.split('/')[2],user=path.split('/')[4];
      if(state.details[id])state.details[id].pendingInvitations=state.details[id].pendingInvitations.filter(i=>i.recipient!==user);
      return reply({revoked:true});
    }

    if(path==='/playlists'&&method==='POST'){
      const p={id:'00000000-0000-0000-0000-000000000123',title:body.title,description:body.description||'',visibility:body.visibility,kind:'manual',owner:'listener',song_count:0};
      state.playlists.unshift(p);state.details[p.id]={playlist:p,tracks:[],members:[],pendingInvitations:(body.invitees||[]).map((i,n)=>({id:'invite-'+n,recipient:i.username,can_edit:i.canEdit}))};return reply({playlist:p,invitationsSent:body.invitees?.length||0},201);
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
  await expect(page.getByText('Queued · waiting for Soulseek peer')).toBeVisible();
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
  await page.getByRole('button',{name:'Import audio to NAS'}).click();
  await expect(page.getByText('Alternate-source imports')).toBeVisible();
  await expect(page.locator('.request-status.queued').last()).toBeVisible();
});
test('artist and album names in song list open Navidrome catalog pages',async({page})=>{
  await setupMocks(page);await login(page,'listener');
  await navigate(page,'Discover');
  await page.getByPlaceholder('Songs, artists, albums...').fill('Kino');
  await page.getByRole('button',{name:'Test Artist',exact:true}).last().click();
  await expect(page.getByRole('heading',{name:'Test Artist'})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Tracks'})).toBeVisible();
  await page.locator('.album-card').filter({hasText:'Test Album'}).first().click();
  await expect(page.getByRole('heading',{name:'Test Album'})).toBeVisible();
});
test('admin sees direct Soulseek import and listener request approvals',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await setupMocks(page);await login(page,'testadmin');
  await navigate(page,'Discover');
  await page.getByRole('button',{name:/Soulseek · New music/}).click();
  await expect(page.getByRole('button',{name:'Search music sources'})).toBeVisible();
  await expect(page.getByText('My NAS imports')).toBeVisible();
  await page.getByPlaceholder('Songs, artists, albums...').fill('Kino');
  await page.getByRole('button',{name:'Search music sources'}).click();
  await page.getByRole('button',{name:'Import song'}).click();
  await expect(page.getByRole('heading',{name:'Import song to NAS'})).toBeVisible();
  expect(errors).toEqual([]);
});

test('playlist collaborators can be invited at creation and to an existing playlist',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await setupMocks(page);await mockSocial(page);await login(page,'listener');
  await navigate(page,'Community');
  await page.locator('.social-tabs').getByRole('button',{name:/^Playlists/}).click();
  await page.getByPlaceholder('Our favorite songs').fill('Road trip together');
  await page.getByLabel('Invite collaborator username').fill('bob');
  await page.getByRole('button',{name:'Add to invitation list'}).click();
  await expect(page.getByText('@bob · Can edit')).toBeVisible();
  await page.getByRole('button',{name:'Create playlist & send invitations'}).click();
  await expect(page.getByRole('heading',{name:'Road trip together'})).toBeVisible();
  await expect(page.getByText('Pending invitations')).toBeVisible();
  await expect(page.getByText('Waiting for response')).toBeVisible();
  await page.getByLabel('Existing playlist invite username').fill('cathy');
  await page.getByRole('button',{name:'Send invitation'}).click();
  await expect(page.getByText('@cathy')).toBeVisible();
  expect(errors).toEqual([]);
});
test('recipient accepts playlist invite from the playlists tab on a narrow phone',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await setupMocks(page);await mockSocial(page,{initialInvite:true});
  await page.setViewportSize({width:320,height:690});
  await login(page,'listener');await navigate(page,'Community');
  await page.locator('.social-tabs').getByRole('button',{name:/^Playlists/}).click();
  await expect(page.getByText("You're invited to collaborate")).toBeVisible();
  await expect(page.getByText('Shared with Listener')).toBeVisible();
  await page.locator('.social-playlist-inbox').getByRole('button',{name:'Accept'}).click();
  await expect(page.getByRole('heading',{name:'Shared with Listener'})).toBeVisible();
  await expect(page.getByText('Can add and remove')).toHaveCount(0);
  const overflow=await page.evaluate(()=>({width:window.innerWidth,scroll:document.documentElement.scrollWidth}));
  expect(overflow.scroll).toBeLessThanOrEqual(overflow.width+1);
  expect(errors).toEqual([]);
});
test('import tracker displays real download percentage without marking a transfer playable',async({page})=>{
  await setupMocks(page);await login(page,'listener');
  await navigate(page,'Discover');
  await page.getByRole('button',{name:/Soulseek · New music/}).click();
  await page.getByPlaceholder('Songs, artists, albums...').fill('Kino');
  await page.getByRole('button',{name:'Search music sources'}).click();
  await page.getByRole('button',{name:'Import song'}).click();
  await page.getByLabel('Artist').fill('Kino');
  await page.getByLabel('Track title').fill('Gruppa Krovi');
  await page.getByRole('button',{name:'Queue import'}).click();
  await expect(page.getByText('Queued · waiting for Soulseek peer')).toBeVisible();
  await expect(page.getByLabel('Import progress: Queued · waiting for Soulseek peer')).toBeVisible();
  await expect(page.getByRole('button',{name:'Play',exact:true})).toHaveCount(0);
});


test('older Kino import attempts are grouped, can be hidden, and do not claim the song downloaded',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await setupMocks(page,{staleImports:true});
  await login(page,'listener');
  await navigate(page,'Discover');
  await page.getByRole('button',{name:/Soulseek · New music/}).click();
  await expect(page.getByText('3 attempts')).toBeVisible();
  await expect(page.getByText(/No active transfer found/)).toBeVisible();
  await page.getByRole('button',{name:'Hide attempts'}).click();
  await expect(page.getByText('3 attempts')).toHaveCount(0);
  await expect(page.getByText(/Previous attempts hidden/)).toBeVisible();
  expect(errors).toEqual([]);
});

test('song rows play on click while favorites and playlist buttons act independently',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const state=await setupMocks(page);
  await page.addInitScript(()=>{
    window.__playEvents=[];
    HTMLMediaElement.prototype.play=function(){
      window.__playEvents.push({src:this.getAttribute('src'),
        userGesture:navigator.userActivation?.isActive??true});
      return Promise.resolve();
    };
  });
  await login(page,'listener');
  await navigate(page,'Discover');
  await page.getByPlaceholder('Songs, artists, albums...').fill('Kino');
  const row=page.locator('.track-row').first();
  await expect(row).toBeVisible();

  await row.getByRole('button',{name:'Favorite Kino'}).click();
  await expect(row.getByRole('button',{name:'Remove favorite Kino'})).toHaveAttribute('aria-pressed','true');
  expect(state.stars.has('s1')).toBe(true);
  expect(await page.evaluate(()=>window.__playEvents.length)).toBe(0);

  await row.getByRole('button',{name:'Add Kino to playlist'}).click();
  await expect(page.getByRole('heading',{name:'Add to playlist'})).toBeVisible();
  await page.locator('.side-panel').getByRole('button',{name:/Favorites Mix/}).click();
  await expect(page.getByRole('heading',{name:'Add to playlist'})).toHaveCount(0);
  expect(state.addedTracks).toEqual([{playlistId:'p1',songId:'s1'}]);
  expect(await page.evaluate(()=>window.__playEvents.length)).toBe(0);

  // A synthetic blank-row click tests the delegated handler independent of
  // layout positioning (the mobile fixed navigation overlaps edge coordinates).
  await row.evaluate(element=>element.click());
  await expect(page.getByRole('button',{name:'Open now playing for Kino'})).toBeEnabled();
  expect((await page.evaluate(()=>window.__playEvents)).at(-1).src).toContain('/api/stream/s1');

  // Move the song above fixed player/navigation overlays. Click the actual
  // rendered title coordinates as a user would, rather than depending on the
  // locator's center-point actionability in animated desktop/mobile layouts.
  await row.locator('.track-song-title').evaluate(el=>el.scrollIntoView({block:'center',inline:'nearest'}));
  const titleBox=await row.locator('.track-song-title').boundingBox();
  expect(titleBox).not.toBeNull();
  await page.mouse.click(titleBox.x+Math.min(titleBox.width/2,18),titleBox.y+titleBox.height/2);
  const starts=await page.evaluate(()=>window.__playEvents);
  expect(starts.length).toBeGreaterThanOrEqual(2);
  expect(starts.at(-1).userGesture).toBe(true);
  expect(errors).toEqual([]);
});

test('Favorites page heart and plus icons receive real pointer clicks and update library',async({page})=>{
  const state=await setupMocks(page,{favoriteSongIds:['s1']});
  const pageErrors=[];page.on('pageerror',err=>pageErrors.push(err.message));
  await login(page,'listener');
  if(await page.locator('.sidebar').isVisible())await page.setViewportSize({width:1646,height:925});
  if(await page.locator('.sidebar').isVisible()){
    await page.locator('.sidebar').getByRole('button',{name:'Favorites',exact:true}).click();
  }else{
    await page.getByRole('button',{name:'More options'}).click();
    await page.locator('.mobile-more-sheet').getByRole('button',{name:'Favorites'}).click();
  }
  const row=page.locator('.track-row').first();
  await expect(row).toBeVisible();
  const heart=row.getByRole('button',{name:'Remove favorite Kino'});
  const plus=row.getByRole('button',{name:'Add Kino to playlist'});
  await expect(heart).toBeEnabled();
  await expect(plus).toBeEnabled();
  const hitInfo=await page.evaluate(()=>{
    return Array.from(document.querySelectorAll('.track-row .track-actions button')).slice(0,2).map(el=>{
      const box=el.getBoundingClientRect(),x=box.x+box.width/2,y=box.y+box.height/2;
      const top=document.elementFromPoint(x,y);
      return {label:el.getAttribute('aria-label'),hit:el===top||el.contains(top),
        top:top?.outerHTML?.slice(0,200),bounds:{x,y,width:box.width,height:box.height}};
    });
  });
  expect(hitInfo).toHaveLength(2);
  expect(hitInfo.every(x=>x.hit),JSON.stringify(hitInfo)).toBe(true);
  // Test exactly what a person does: move onto the icon, then press it.
  const plusBox=await plus.boundingBox();
  expect(plusBox).not.toBeNull();
  const pointerX=plusBox.x+plusBox.width/2,pointerY=plusBox.y+plusBox.height/2;
  await page.mouse.move(pointerX,pointerY);
  const hoveredTarget=await page.evaluate(({x,y})=>{
    const top=document.elementFromPoint(x,y);
    return top?.closest('button')?.getAttribute('aria-label')||'NOT_A_BUTTON';
  },{x:pointerX,y:pointerY});
  expect(hoveredTarget).toBe('Add Kino to playlist');
  await plus.evaluate(button=>{
    window.__favoritesEvents=[];
    for(const type of ['pointerdown','pointerup','click']){
      document.addEventListener(type,e=>{
        if(e.target.closest?.('.track-actions'))window.__favoritesEvents.push({type,tag:e.target.tagName,label:e.target.closest('button')?.getAttribute('aria-label')||null});
      },{capture:true,once:false});
    }
    window.__plusNativeClicks=0;
    button.addEventListener('click',()=>{window.__plusNativeClicks++});
  });
  await page.mouse.click(pointerX,pointerY);
  const clickDiagnostics=await page.evaluate(()=>({
    nativeClicks:window.__plusNativeClicks,
    events:window.__favoritesEvents,
    panel:!!document.querySelector('.side-panel'),
    rowActionCount:document.querySelectorAll('.track-actions button').length
  }));
  expect(clickDiagnostics.panel,JSON.stringify(clickDiagnostics)).toBe(true);
  await expect(page.getByRole('heading',{name:'Add to playlist'})).toBeVisible();
  await page.locator('.side-panel').getByRole('button',{name:/Favorites Mix/}).click();
  await expect(page.getByRole('heading',{name:'Add to playlist'})).toHaveCount(0);
  expect(state.addedTracks).toEqual([{playlistId:'p1',songId:'s1'}]);
  await heart.click();
  await expect(row).toHaveCount(0);
  expect(state.stars.has('s1')).toBe(false);
  expect(pageErrors).toEqual([]);
});

test('playlist tools search tracks, change privacy, heart songs and upload album artwork',async({page})=>{
  const state=await setupMocks(page),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await login(page,'listener');
  await navigate(page,'Your Library');
  await page.locator('.playlist-grid').getByRole('button',{name:/Favorites Mix/}).click();
  await expect(page.getByRole('button',{name:/Invite collaborators/})).toBeVisible();
  await expect(page.getByRole('switch',{name:/Private · Make public/})).toBeVisible();
  await page.getByRole('searchbox',{name:'Find a song in this playlist'}).fill('Kino');
  await expect(page.locator('.track-row')).toHaveCount(1);
  page.once('dialog',dialog=>dialog.accept());
  await page.getByRole('switch',{name:/Private · Make public/}).click();
  await expect(page.getByRole('switch',{name:/Public · Make private/})).toBeVisible();
  expect(state.playlists[0].public).toBe(true);
  await page.getByRole('button',{name:'Heart all songs'}).click();
  await expect.poll(()=>state.stars.size).toBe(2);
  await page.getByRole('button',{name:/Back to library/}).click();
  await page.locator('.album-grid .album-card').first().click();
  await expect(page.getByText('Upload album picture')).toBeVisible();
  await page.locator('.artwork-upload input[type=file]').setInputFiles({
    name:'my-cover.png',mimeType:'image/png',
    buffer:Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.alloc(64)])
  });
  await expect.poll(()=>state.artworkUploads.length).toBe(1);
  expect(errors).toEqual([]);
});

test('playlist migration import parses Spotify CSV locally',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await setupMocks(page);await login(page,'listener');
  if(await page.locator('.mobile-nav').isVisible()){
    await page.getByRole('button',{name:'More options'}).click();
    await page.locator('.mobile-more-sheet').getByRole('button',{name:/Import Spotify/}).click();
  }else await page.locator('.sidebar').getByRole('button',{name:'Import music'}).click();
  await expect(page.getByRole('heading',{name:/Bring your music/})).toBeVisible();
  await page.getByLabel('Upload Spotify or Apple Music collection export').setInputFiles({
    name:'Spotify Favorites.csv',mimeType:'text/csv',
    buffer:Buffer.from('Track Name,Artist Name,Album Name\\nKino,Test Artist,Test Album\\nRoving Gambler,The Country Gentlemen,Vintage\\n'.replace(/\\n/g,'\n'))
  });
  await expect(page.getByText(/Loaded 1 collection\(s\), 2 track entries/)).toBeVisible();
  await expect(page.getByRole('button',{name:/Check next 2/})).toBeEnabled();
  expect(errors).toEqual([]);
});

test('mobile player shows previous and separate seek timeline',async({page,isMobile})=>{
  if(!isMobile)return;
  await setupMocks(page);await login(page,'listener');
  await page.getByRole('button',{name:'Play something good'}).click();
  const previous=page.getByRole('button',{name:'Previous song'});
  await expect(previous).toBeVisible();
  const play=page.locator('.player .play-round');
  const seek=page.locator('.player .seek');
  await expect(seek).toBeVisible();
  const p=await play.boundingBox(),bar=await seek.boundingBox();
  expect(p&&bar).toBeTruthy();
  expect(bar.y).toBeGreaterThan(p.y+p.height-3);
});

test('collaborate button opens a private reusable invite-enabled copy',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await setupMocks(page);await login(page,'listener');
  await navigate(page,'Your Library');
  await page.locator('.playlist-grid').getByRole('button',{name:/Favorites Mix/}).click();
  await page.getByRole('button',{name:/Invite collaborators/}).click();
  await expect(page.getByText('Sharing & collaborators')).toBeVisible();
  await expect(page.getByRole('button',{name:/Send invitation/})).toBeDisabled();
  expect(errors).toEqual([]);
});

test('web Import music exposes script, setup guide and both provider choices',async({page})=>{
  await setupMocks(page);
  await login(page,'listener');
  if(await page.locator('.mobile-nav').isVisible()){
    await page.getByRole('button',{name:'More options'}).click();
    await page.locator('.mobile-more-sheet').getByRole('button',{name:/Import Spotify/}).click();
  }else await page.locator('.sidebar').getByRole('button',{name:'Import music'}).click();
  await expect(page.getByRole('link',{name:/Download (?:browser )?exporter/})).toHaveAttribute('href','/tools/jobbi-collection-export.user.js');
  await expect(page.getByRole('link',{name:'Read setup guide'})).toHaveAttribute('href',/github\.com\/b3njaram\/navidrome/);
  await expect(page.getByRole('link',{name:'Open Spotify'})).toHaveAttribute('href','https://open.spotify.com/');
  await expect(page.getByRole('link',{name:'Open Apple Music'})).toHaveAttribute('href','https://music.apple.com/');
  const script=await page.request.get('/tools/jobbi-collection-export.user.js');
  expect(script.ok()).toBe(true);
  expect(await script.text()).toContain('// ==UserScript==');
});

test('combined collection JSON automatically hearts Liked Songs and builds a separate playlist',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const state=await setupMocks(page);
  await login(page,'listener');
  if(await page.locator('.mobile-nav').isVisible()){
    await page.getByRole('button',{name:'More options'}).click();
    await page.locator('.mobile-more-sheet').getByRole('button',{name:/Import Spotify/}).click();
  }else await page.locator('.sidebar').getByRole('button',{name:'Import music'}).click();
  const manifest={format:'jobbi-collection-export/v1',exportedAt:'2026-11-10',
    collections:[
      {id:'spotify:favorites',kind:'favorites',name:'Liked Songs',provider:'spotify',
        tracks:[{title:'Kino',artist:'Test Artist',album:'Test Album'}]},
      {id:'spotify:road',kind:'playlist',name:'Road Trip',provider:'spotify',
        tracks:[{title:'Kino',artist:'Test Artist',album:'Test Album'}]}
    ]};
  await page.getByLabel('Upload Spotify or Apple Music collection export').setInputFiles({
    name:'jobbi-music-collections.json',mimeType:'application/json',
    buffer:Buffer.from(JSON.stringify(manifest))
  });
  await expect(page.locator('.transfer-collection')).toHaveCount(2);
  await expect(page.getByText(/Favorites remain favorites; playlists remain separate/)).toBeVisible();
  await page.getByRole('button',{name:'Check next 1'}).click();
  await expect.poll(()=>state.stars.has('s1')).toBe(true);
  await expect(page.getByText('Saved in your Jobbi Music Favorites')).toBeVisible();
  await page.locator('.transfer-collection').filter({hasText:'Road Trip'}).click();
  await page.getByRole('button',{name:'Check next 1'}).click();
  await expect.poll(()=>state.playlists.some(p=>p.name==='Road Trip')).toBe(true);
  await expect.poll(()=>state.addedTracks.some(x=>x.songId==='s1'&&x.playlistId==='p2')).toBe(true);
  expect(errors).toEqual([]);
});

test('Apple Music Favorite Songs userscript captures current track-list-item rows and inner-pane scrolling',async({page})=>{
  const rows=[
    ['Circle of Death','Flawed Mangoes','Anomaly IV','2:40'],
    ['Мама-анархия','Кино','Ночь','2:42'],
    ['Feel It','Ayesha Erotica','Feel It - Single','2:30']
  ];
  const row=(title,artist,album,duration,index)=>`
    <div data-testid="track-list-item" data-index="${index}" style="height:85px">
      <span data-testid="track-title">${title}</span>
      <span data-testid="track-column-secondary">${artist}</span>
      <span data-testid="track-column-tertiary">${album}</span>
      <span data-testid="track-duration">${duration}</span>
    </div>`;
  await page.route('https://music.apple.com/**',route=>route.fulfill({
    status:200,contentType:'text/html; charset=utf-8',
    body:`<!doctype html><html><head><meta charset="utf-8"></head><body><main><h1>Favorite Songs</h1>
      <div id="scrollable-page" style="height:190px;overflow-y:auto">
        <div id="track-collection">${rows.slice(0,2).map((x,i)=>row(...x,i)).join('')}</div>
        <div style="height:650px"></div>
      </div></main></body></html>`
  }));
  await page.addInitScript(()=>{
    window.GM_getValue=()=>({collections:[]});
    window.GM_setValue=()=>{};
  });
  await page.goto('https://music.apple.com/us/library/playlist/p.test');
  await page.evaluate(([title,artist,album,duration])=>{
    const pane=document.querySelector('#scrollable-page');
    pane.addEventListener('scroll',()=>{
      if(pane.scrollTop>0&&!document.querySelector('[data-index="2"]')){
        const r=document.createElement('div');
        r.setAttribute('data-testid','track-list-item');
        r.setAttribute('data-index','2');
        r.innerHTML=`<span data-testid="track-title">${title}</span>
          <span data-testid="track-column-secondary">${artist}</span>
          <span data-testid="track-column-tertiary">${album}</span>
          <span data-testid="track-duration">${duration}</span>`;
        document.querySelector('#track-collection').appendChild(r);
      }
    });
  },rows[2]);
  await page.addScriptTag({content:readFileSync(
    new URL('../tools/jobbi-collection-export.user.js',import.meta.url),'utf8')});
  await expect(page.getByText('Favorite Songs',{exact:true}).last()).toBeVisible();
  await page.getByRole('button',{name:'Capture current collection'}).click();
  await expect(page.locator('#jobbi-collection-exporter #status')).toContainText('Saved 3 songs as Favorites',{timeout:25000});
  const downloaded=page.waitForEvent('download');
  await page.getByRole('button',{name:'Download all as JSON'}).click();
  const file=await downloaded;
  const manifest=JSON.parse(readFileSync(await file.path(),'utf8'));
  expect(manifest.format).toBe('jobbi-collection-export/v1');
  expect(manifest.collections).toHaveLength(1);
  expect(manifest.collections[0].name).toBe('Favorite Songs');
  expect(manifest.collections[0].kind).toBe('favorites');
  expect(manifest.collections[0].tracks).toHaveLength(3);
  expect(manifest.collections[0].tracks.map(t=>t.title)).toEqual(
    ['Circle of Death','Мама-анархия','Feel It']);
  expect(manifest.collections[0].tracks[1].artist).toBe('Кино');
  expect(manifest.collections[0].tracks[2].album).toBe('Feel It - Single');
});
