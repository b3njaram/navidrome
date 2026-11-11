import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {collectRemovalImpact,makeRemovalTicket,verifyRemovalTicket,impactForClient} from '../server/removal-impact.js';

const user={username:'alice'};
const song={id:'s1',title:'Bad version',artist:'Example',path:'Music/Bad version.flac'};
function fixtures({playlists=[{id:'mine',name:'My Playlist',owner:'alice'},
  {id:'shared',name:'Public Mix',owner:'bob',public:true}],social=[
    {id:'111',title:'Alice favorites',owner:'alice',visibility:'private',visible_to_user:true},
    {id:'222',title:'Bob secret',owner:'bob',visibility:'private',visible_to_user:false},
    {id:'333',title:'Public Jam',owner:'carol',visibility:'public',visible_to_user:false}
  ]}={}){
  const subsonic=async(_user,method,params)=>{
    if(method==='getSong')return {song};
    if(method==='getPlaylists')return {playlists:{playlist:playlists}};
    if(method==='getStarred2')return {starred2:{song:[]}};
    if(method==='getPlaylist')return {playlist:{...playlists.find(p=>p.id===params.id),entry:[{id:'s1'}]}};
    throw Error('Unexpected '+method);
  };
  return {subsonic,socialQuery:async()=>({rows:social})};
}
test('review warns about visible and hidden song references, without leaking private titles',async()=>{
  const impact=await collectRemovalImpact({user,id:'s1',...fixtures()});
  assert.equal(impact.referenceCount,5);
  const hidden=impact.references.find(p=>p.restricted);
  assert.equal(hidden.name,'Private playlist (name hidden)');
  assert.equal(hidden.owner,null);
  assert.equal(hidden.id,null);
  const own=impact.references.find(p=>p.name==='My Playlist');
  assert.equal(own.own,true);
  assert.match(impact.warning,/private Navidrome playlists that cannot be inspected/);
  const secret=crypto.randomBytes(32);
  const token=makeRemovalTicket({username:'alice',id:'s1',signature:impact.signature},secret);
  const out=impactForClient(impact,token);
  assert.equal(out.path,undefined);
  assert.equal(out.signature,undefined);
  assert.doesNotMatch(JSON.stringify(out),/Bob secret/);
  assert.equal(verifyRemovalTicket(token,{username:'alice',id:'s1',signature:impact.signature},secret),true);
  assert.equal(verifyRemovalTicket(token,{username:'bob',id:'s1',signature:impact.signature},secret),false);
  assert.equal(verifyRemovalTicket(token,{username:'alice',id:'s2',signature:impact.signature},secret),false);
  assert.equal(verifyRemovalTicket(token,{username:'alice',id:'s1',signature:'changed'},secret),false);
});
test('listener Favorites are included in removal impact',async()=>{
  const base=fixtures({playlists:[],social:[]});
  const impact=await collectRemovalImpact({user,id:'s1',...base,
    subsonic:async(u,method,args)=>method==='getStarred2'
      ?{starred2:{song:[{id:'s1'}]}}:base.subsonic(u,method,args)});
  assert.equal(impact.referenceCount,1);
  assert.equal(impact.references[0].name,'Favorites');
  assert.equal(impact.references[0].own,true);
});
test('confirmation tokens expire and cannot be modified',async()=>{
  const secret=crypto.randomBytes(32),args={username:'alice',id:'s1',signature:'hash'};
  const token=makeRemovalTicket(args,secret,1000000);
  assert.equal(verifyRemovalTicket(token,args,secret,1000000+3*60*1000),true);
  assert.equal(verifyRemovalTicket(token,args,secret,1000000+3*60*1000+1),false);
  assert.equal(verifyRemovalTicket(token+'x',args,secret,1000001),false);
});
test('unavailable social references fail closed rather than reporting zero',async()=>{
  const deps=fixtures();
  await assert.rejects(collectRemovalImpact({user,id:'s1',...deps,
    socialQuery:async()=>{throw Error('database offline')}}),/database offline/);
});
test('missing accessible playlist data fails closed',async()=>{
  const deps=fixtures();
  await assert.rejects(collectRemovalImpact({user,id:'s1',...deps,
    subsonic:async(u,name,args)=>{
      if(name==='getPlaylist')throw Error('permission denied');
      return deps.subsonic(u,name,args);
    }}),/permission denied/);
});
test('changing playlist references changes the confirmation signature',async()=>{
  const first=await collectRemovalImpact({user,id:'s1',...fixtures({social:[]})});
  const second=await collectRemovalImpact({user,id:'s1',...fixtures({social:[{
    id:'hidden',title:'secret',owner:'someone',visibility:'private',visible_to_user:false
  }]})});
  assert.notEqual(first.signature,second.signature);
});
