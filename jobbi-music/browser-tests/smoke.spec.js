import {test,expect} from '@playwright/test';

async function setupMocks(page){
  const state={session:null,playlists:[{id:'p1',name:'Favorites Mix',songCount:0}]};
  await page.route('**/api/**',async route=>{
    const req=route.request();
    const url=new URL(req.url());
    const method=req.method();
    const pathname=url.pathname;
    const body=(()=>{try{return req.postDataJSON()||{}}catch{return {}}})();
    const reply=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
    if(pathname.startsWith('/api/cover/'))return route.fulfill({status:404,body:''});
    if(pathname.startsWith('/api/stream/'))return route.fulfill({status:200,contentType:'audio/mpeg',body:''});
    if(pathname==='/api/session')return reply(state.session);
    if(pathname==='/api/login'){const isAdmin=body.username==='testadmin';state.session={username:body.username,admin:isAdmin,csrfToken:'test-csrf-token'};return reply(state.session);}
    if(pathname==='/api/logout'){state.session=null;return reply({ok:true});}
    if(pathname==='/api/home')return reply({recent:[{id:'a1',name:'Test Album',artist:'Test Artist'}],featured:[],played:[],songs:[{id:'s1',title:'Kino',artist:'Test Artist',duration:180}],playlists:state.playlists});
    if(pathname==='/api/starred')return reply({song:[],album:[]});
    if(pathname==='/api/search')return reply({artist:[],album:[{id:'a1',name:'Test Album',artist:'Test Artist'}],song:[{id:'s1',title:'Kino',artist:'Test Artist',album:'Test Album',duration:180}]});
    if(pathname==='/api/library/albums')return reply({albums:[{id:'a1',name:'Test Album',artist:'Test Artist'}],offset:0,size:48});
    if(pathname==='/api/library/artists')return reply({artists:[{id:'artist1',name:'Test Artist'}],count:1});
    if(pathname==='/api/albums/a1')return reply({id:'a1',name:'Test Album',artist:'Test Artist',song:[{id:'s1',title:'Kino',artist:'Test Artist',duration:180}]});
    if(pathname==='/api/playlists'&&method==='GET')return reply(state.playlists);
    if(pathname==='/api/playlists'&&method==='POST'){state.playlists.push({id:'p2',name:body.name,songCount:0});return reply({playlist:state.playlists.at(-1)},201);}
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
  await navigate(page,'Search');
  await page.getByPlaceholder('Songs, artists, albums...').fill('Kino');
  await expect(page.getByText('Kino',{exact:true}).first()).toBeVisible();
  await navigate(page,'Your Library');
  await expect(page.getByText('Test Album').first()).toBeVisible();
  await page.getByPlaceholder('Give your playlist a name').fill('Road Trip');
  await page.getByRole('button',{name:'Create',exact:true}).click();
  await expect(page.getByText('Road Trip').first()).toBeVisible();
  expect(errors).toEqual([]);
});
test('administrator sees volume stats and restricted user management',async({page})=>{
  const errors=[];page.on('pageerror',err=>errors.push(err.message));
  await setupMocks(page);await login(page,'testadmin');
  await navigate(page,await page.locator('.mobile-nav').first().isVisible()?'Admin':'Admin console');
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
  await navigate(page,'Search');
  await page.getByPlaceholder('Songs, artists, albums...').fill('Kino');
  await page.getByRole('button',{name:/Find more music/}).click();
  await page.getByRole('button',{name:'Search Soulseek'}).click();
  await expect(page.getByText('Music from Soulseek')).toBeVisible();
  await expect(page.getByText('Кино - Группа крови.flac')).toBeVisible();
  await page.getByRole('button',{name:'Add to library'}).click();
  await expect(page.getByText('Add to your library')).toBeVisible();
  expect(errors).toEqual([]);
});
