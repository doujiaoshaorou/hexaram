# Third-party notices

This application is a modified distribution of Rank Analysis by wnzzer, licensed under MIT. Upstream source: https://github.com/wnzzer/rank-analysis, commit `5e9fe0c64233126e3a2c0dc0784dca18e1ddaf08`. The original copyright and license text are retained in `LICENSE`.

The fork retains the upstream Vue/Tauri/Rust application, window chrome, client/session listeners, player cards, match records, match details, assets, SGP mapping, and associated infrastructure. Hexaram adds dedicated Mayhem data selection, OP.GG Mayhem ratings/recommendations, independent personal archives, champion/augment personal statistics, and fork branding/update isolation. It does not claim these upstream components as original work.

OP.GG data is attributed in the UI and loaded from its public Mayhem page. Riot Games game assets are provided through the installed League client. This project is not affiliated with or endorsed by Riot Games or OP.GG. Bundled upstream fonts and dependencies retain their original license notices.

Hexaram fork author: doujiaoshaorou. Development assisted by GPT-6 Astra. WY mark and Hexaram-specific modifications added in 0.4.0. AI match review uses dedicated Mayhem rules while retaining the upstream seven-factor MVP/SVP computation.

## Tauri NSIS installer template

`rank-analysis-app/src-tauri/windows/installer.nsi` is adapted from the Tauri CLI 2.11.4 template (https://github.com/tauri-apps/tauri/blob/tauri-cli-v2.11.4/crates/tauri-bundler/src/bundle/windows/nsis/installer.nsi), with the English install folder separated from the display name. It is distributed under the MIT license option:

MIT License

Copyright (c) 2017 - Present Tauri Apps Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
