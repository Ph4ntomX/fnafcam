# FNAF Glitch Cam

A cursed security camera viewer for your face. Open it in a browser, point your webcam at yourself, and wait.

## Setup

1. Open `index.html` in Chrome or Firefox
2. Allow webcam access
3. Click **CAPTURE GLITCH FACE** while making a horrifying expression (or several)
4. Watch your own face haunt you at random intervals

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

## Notes

- No dependencies, no build step — three files, open and go
- Works best with dramatic lighting and poor life choices
- The more faces you capture, the more unpredictable the glitches get
