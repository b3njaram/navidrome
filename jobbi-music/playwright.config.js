import {defineConfig,devices} from '@playwright/test';
export default defineConfig({
  testDir:'./browser-tests',
  timeout:30000,
  expect:{timeout:8000},
  retries:process.env.CI?1:0,
  reporter:process.env.CI?'github':'list',
  fullyParallel:true,
  use:{baseURL:'http://127.0.0.1:4173',trace:'retain-on-failure',screenshot:'only-on-failure'},
  projects:[
    {name:'desktop-chromium',use:{...devices['Desktop Chrome']}},
    {name:'iphone-webkit',use:{...devices['iPhone 13']}},
    // Firefox hit-testing is important for desktop Synology listeners.
    {name:'desktop-firefox',grep:/Favorites page heart and plus icons receive real pointer clicks/,use:{...devices['Desktop Firefox']}}
  ],
  webServer:{
    command:'npm run preview -- --host 127.0.0.1 --port 4173',
    url:'http://127.0.0.1:4173',
    reuseExistingServer:!process.env.CI,
    timeout:60000
  }
});
