# FNAF Glitch Cam

Security camera viewer for your face based on a meme I found online. Open it in a browser, point your webcam at yourself, and wait.

## Setup

1. Open `index.html` in Chrome or Firefox
2. Allow webcam access
3. Click **CAPTURE GLITCH FACE** while making a horrifying expression (or several)
4. Watch your own face haunt you at random intervals, prank your friends in online calls with this

## Features

- Live webcam feed rendered to canvas
- Random glitch events that flash your captured faces with chromatic aberration, scan line tearing, and static
- CCTV overlays: green phosphor tint, vignette, scan lines, CAM 01 label, live timestamp, blinking REC dot, fisheye lens
- Each overlay is independently toggleable
- Glitch intensity slider: Low → Medium → High → **Unhinged**
- **Go Live** button exports the canvas as a 30fps `MediaStream` for use in OBS

## OBS / Streaming

Click **Go Live**, then add a Browser Source in OBS pointed at this page. Or use OBS Virtual Camera to pipe it into any video app.

The stream is also accessible at `window.glitchCamStream` from the browser console.

It's not GREAT but I made this in like 10 minutes so it's all cool.

## How I Made This

I made an initial prompt with Claude describing the meme I found and then used Claude Code in the terminal.

## Original Meme

https://www.youtube.com/watch?v=lKq8tEeL6CM