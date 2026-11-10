import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';

const exporter=readFileSync(new URL('../tools/jobbi-collection-export.user.js',import.meta.url),'utf8');

async function capture(page,{provider='apple',markup,path='/us/playlist/my-music/pl.123'}){
  const url=provider==='apple'?'https://music.apple.com'+path:
    'https://open.spotify.com'+path;
  await page.route(url,route=>route.fulfill({
    contentType:'text/html',
    body:'<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>'+
      markup+'</body></html>'
  }));
  await page.goto(url);
  await page.evaluate(()=>{
    window.GM_getValue=()=>({collections:[]});
    window.GM_setValue=(_key,value)=>{window.__jobbiCapture=value};
  });
  await page.addScriptTag({content:exporter});
  await page.getByRole('button',{name:'Capture current collection'}).click();
  await expect(page.locator('#jobbi-collection-exporter #status'))
    .toContainText(/Saved \d+ songs|Capture stopped:/,{timeout:15000});
  return {
    status:await page.locator('#jobbi-collection-exporter #status').innerText(),
    saved:await page.evaluate(()=>window.__jobbiCapture)
  };
}

test('Apple Music modern track-list-item rows capture both artists and songs',async({page})=>{
  const result=await capture(page,{markup:`
    <main id="scrollable-page"><h1>My playlist</h1>
    <div data-testid="track-list-item" aria-rowindex="1">
      <div data-testid="track-column-primary"><span data-testid="track-title">Dark Beach</span></div>
      <div data-testid="track-column-secondary">PASTEL GHOST</div>
      <a href="/us/album/abyss/123?i=456">Open</a>
    </div>
    <div data-testid="track-list-item" aria-rowindex="2">
      <div data-testid="track-column-primary"><span data-testid="track-title">Roving Gambler</span></div>
      <div data-testid="track-column-secondary">The Country Gentlemen</div>
    </div></main>`});
  expect(result.status).toMatch(/Saved 2 songs/);
  expect(result.saved.collections[0].tracks.map(x=>x.artist))
    .toEqual(['PASTEL GHOST','The Country Gentlemen']);
});

test('Apple Music legacy by-line class now captures songs',async({page})=>{
  const result=await capture(page,{markup:`
    <main id="scrollable-page"><h1>Older playlist</h1>
    <div class="songs-list-row" data-index="0"><span class="songs-list-row__song-name">Song A</span>
      <span class="songs-list-row__by-line">Artist A</span></div>
    <div class="songs-list-row" data-index="1"><span class="songs-list-row__song-name">Song B</span>
      <span class="songs-list-row__by-line">Artist B</span></div></main>`});
  expect(result.status).toMatch(/Saved 2 songs/);
  expect(result.saved.collections[0].tracks.map(x=>x.title)).toEqual(['Song A','Song B']);
});

test('Apple Music falls back to song-link list items when classes change',async({page})=>{
  const result=await capture(page,{markup:`
    <main id="scrollable-page"><h1>Another playlist</h1><ul>
      <li><a href="/us/album/song-a/11?i=111">Song A</a><div class="track-secondary">Artist A</div></li>
      <li><a href="/us/album/song-b/22?i=222">Song B</a><div class="track-secondary">Artist B</div></li>
    </ul></main>`});
  expect(result.status).toMatch(/Saved 2 songs/);
  expect(result.saved.collections[0].tracks[0].artist).toBe('Artist A');
});

test('Spotify Liked Songs is exported as Favorites and duplicate entries survive',async({page})=>{
  const result=await capture(page,{
    provider:'spotify',path:'/collection/tracks',
    markup:`<main><h1>Liked Songs</h1>
      <div data-testid="tracklist-row"><a href="/track/abc">Track One</a><a href="/artist/a">Artist A</a></div>
      <div data-testid="tracklist-row"><a href="/track/abc">Track One</a><a href="/artist/a">Artist A</a></div>
    </main>`
  });
  expect(result.status).toMatch(/Saved 2 songs/);
  expect(result.saved.collections[0].kind).toBe('favorites');
  expect(result.saved.collections[0].tracks).toHaveLength(2);
});

test('Empty Apple playlist reports row diagnostics instead of misleading success',async({page})=>{
  const result=await capture(page,{markup:'<main id="scrollable-page"><h1>No data</h1></main>'});
  expect(result.saved).toBeUndefined();
  expect(result.status).toMatch(/Found 0 possible rows, 0 with a title and artist/);
});
