import type { Article } from './types'

const articles: Article[] = [
  {
    id: 'containers-and-codecs',
    title: 'Containers and codecs',
    summary: 'Why “MP4” names the box, not what is inside it.',
    group: 'The basics',
    body: `A video file is really two things working together: a container and one or more codecs.

## The container

The container is the box. It holds the picture track, the sound track and the information that keeps them in step, such as how long each frame lasts and where each one sits in the file. MP4, MOV and MKV are containers. The ending of a file name, such as .mp4 or .mov, usually tells you the container and nothing more.

## The codec

A codec is the method used to squeeze the picture or the sound so that it takes up less space, and to unpack it again for playback. H.264 (also called AVC) and H.265 (also called HEVC) are common video codecs. AAC and Opus are common audio codecs.

This is why two files that both end in .mp4 can behave differently. One may hold H.264 video, which almost every device can play, while another holds a newer codec that an older phone or television cannot decode.

## What Universal Video reads and writes

Universal Video opens MP4, M4V and MOV files, and it writes MP4 with H.264 video and AAC sound. That combination is used because it plays almost everywhere: on phones, computers and televisions, and on most websites and messaging apps.

Some files it cannot open:
- **MKV and WebM**, which use a different kind of container.
- **AVI and WMV**, which usually also need codecs that browsers do not include.
- **Fragmented MP4**, a variant that some screen recorders and phone apps produce.

If a file cannot be opened, the app tells you why as soon as you add it, rather than failing part-way through.`,
  },
  {
    id: 'resolution-bitrate-frame-rate',
    title: 'Resolution, bitrate and frame rate',
    summary: 'The three numbers that decide how a video looks and how big it is.',
    group: 'The basics',
    body: `Three numbers describe most of what you need to know about a video.

## Resolution

Resolution is the size of each frame in pixels, written as width by height. 1920×1080 is often called Full HD or 1080p, 1280×720 is 720p, and 3840×2160 is 4K. More pixels means more detail, but also more data to store for every frame.

The “p” number names the shorter side of the picture. A 1080p video filmed on a phone held upright is 1080 pixels wide and 1920 tall.

## Frame rate

Frame rate is how many pictures are shown each second, measured in frames per second (fps). Films are traditionally 24 fps, a lot of video is 25 or 30 fps, and phones often record at 60 fps for smoother motion. Twice the frame rate means roughly twice as many pictures to store.

## Bitrate

Bitrate is how much data is spent on each second of video, usually given in megabits per second (Mbps). It is the number that most directly decides the file size: one minute at 8 Mbps comes to about 60 MB, whatever the resolution.

At the same bitrate, a larger picture has fewer bits to spend on each pixel, so it can look worse than a smaller one. That is why lowering the resolution is often the most effective way to make a file smaller without it looking rough.

## How Universal Video uses them

You choose the resolution and one of three quality settings: **Smaller**, **Balanced** or **Best**. You are not asked for a bitrate. Instead, the app works one out from the size of the frame and the frame rate, so a 4K clip gets a bigger budget than a 720p one on the same setting. The frame rate follows your original video.

The size the finished file should come out at is worked out from these settings and shown on the export button before you press it.`,
  },
  {
    id: 'why-video-files-are-big',
    title: 'Why video files are so big',
    summary: 'What compression does, and why shrinking a video is always a trade.',
    group: 'The basics',
    body: `Video is a lot of pictures. A single 1080p frame has just over two million pixels, and each one needs a colour. Stored with no compression at all, one second of 1080p video at 30 frames per second would take roughly 190 MB, and an hour would fill most laptops.

## How compression brings that down

Video codecs such as H.264 rely on two main ideas.

- **Within a frame**, they spend less detail where your eye is unlikely to notice, such as in smooth areas of sky or in fine texture.
- **Between frames**, they store only what has changed. In most video, much of each picture is the same as the one before, so a frame can often be described as “the previous one, with these parts moved”.

Frames that are stored in full are called keyframes. The frames in between depend on them, which is why editing software has to start decoding from a keyframe even when you trim at a point in between.

## Why re-encoding makes files smaller

Phones and cameras record at a high bitrate so they can keep up in real time and hold on to plenty of detail. Re-encoding at a lower bitrate, a smaller resolution, or both, can often make a file several times smaller while it still looks good on a phone or laptop screen.

It is always a trade, though. Each time a video is compressed, some detail is thrown away for good, and compressing it again cannot bring that detail back. Keep your original if you might want full quality later.

## When a file gets bigger

Re-encoding does not always shrink a file. If the original was already heavily compressed and you choose a larger resolution or the **Best** setting, the new file can come out bigger. Universal Video shows the expected size before you export, so you can see this before you commit.`,
  },
  {
    id: 'where-the-work-happens',
    title: 'Where your video is processed',
    summary: 'Every step happens in your browser, on your device.',
    group: 'How it works',
    body: `Universal Video does all of its work inside the browser tab you are using. Your video is opened, decoded, edited and re-encoded on your own device, and the finished file is saved straight back to it.

## How that is possible

Modern browsers have video encoders and decoders built in, the same ones they use for video calls. A browser feature called WebCodecs lets a web page use them directly. Universal Video uses these built-in codecs for the picture and the sound, and its own open-source code to read and write the MP4 file around them.

Because the codecs are already part of your browser, there is no large download before you can start, and nothing needs to be installed.

## What this means in practice

- **No upload and no queue.** Nothing has to travel to a server and back, so how long an export takes depends on your own device.
- **No file size limit set by us.** The limit is your device's memory. The article on big files explains how that works.
- **It works offline.** Once the app has loaded, you can turn off your internet connection and still trim, cut, join and export a video. That is also the simplest way to check that nothing is being sent anywhere.

## Which browsers work

Universal Video is tested in Chrome and Edge on a computer. Safari 16.4 and later includes WebCodecs and may work, but it has not been tested there. Firefox does not currently provide the H.264 encoder the app needs, so the app tells you as soon as you arrive rather than after a long wait.

## Good to know

- The videos you add are held by the browser tab. Reloading or closing the tab ends your edit, so export before you do either.
- While an export runs, the time remaining is based on how fast your own device is actually encoding, so it becomes more accurate as it goes.
- A smaller output resolution is quicker to encode as well as smaller to store.`,
  },
  {
    id: 'export-settings',
    title: 'Choosing your export settings',
    summary: 'Frame shape, resolution, quality, sound, and one file or several.',
    group: 'How it works',
    body: `The settings in the export panel apply to the whole video. Here is what each one does.

## Frame

The frame is the shape the finished video is written at. You can keep the size it was filmed at, choose 1920×1080 (landscape), 1080×1920 (upright) or 1080×1080 (square), or type a size of your own.

If a clip is a different shape from the frame, it is centred and the rest is filled with black. Nothing is ever cropped off: an upright phone clip in a landscape frame keeps all of its picture and gains a black bar down each side. The preview shows exactly what will come out.

Both sides are always an even number of pixels, because H.264 works in blocks and many encoders refuse an odd size.

## Resolution

Keep the original size, or cap it at 4K, 1440p, 1080p, 720p or 480p. The number names the shorter side, so an upright clip capped at 1080p comes out 1080 pixels wide. A video that is already smaller than the cap keeps its own size rather than being enlarged.

## Quality

- **Smaller** squeezes the most. Fine for sending and for the web.
- **Balanced** is the default. Noticeably smaller, and still looks like the original.
- **Best** keeps the most detail, and makes the biggest file of the three.

## Sound

Keep the sound and choose its bitrate (96, 128, 192 or 256 kbps), or switch it off to write a silent video, which is smaller.

## One video or separate files

If you have cut your video into pieces, you can export it as one video or as **separate files**. With separate files, each piece is written as its own MP4 and they arrive together in a single zip file, numbered so that they sort back into the order you cut them. On Chrome and Edge you are asked where to save the zip first, and each piece is written into it as soon as it is finished.

Separate files are not available when clips are stacked on more than one track, because two clips playing at the same moment cannot be split into one file each.

## Before you press export

The expected file size is shown on the export button. If the export would not fit in your device's memory, the app says so before you start and suggests a setting that would fit.`,
  },
  {
    id: 'big-files',
    title: 'Big files and the memory ceiling',
    summary: 'Why the size of the result matters more than the size of the original.',
    group: 'How it works',
    body: `Because Universal Video works inside your browser, it is limited by how much memory the browser can use. There is no upload limit, because there is no upload, but there is still a ceiling.

## What uses the memory

Every clip on the timeline is read into memory in full, and the finished video is assembled in memory too before it is saved. So an edit with five clips needs room for all five, plus the result.

## The result is what counts

The ceiling is roughly a gigabyte or so of finished video on a computer, and less on a phone. What matters most is the size of the file you are making, not the one you started with. Shrinking a 2 GB video to 300 MB can work perfectly well, while turning a 400 MB video into a 5 GB one will not.

## Refused before, not after

When a browser tab runs out of memory, it usually just closes, with no chance to save anything. So the app checks first:

1. When you add a video, it reads only the small part of the file that describes it, so even a very large file is understood almost instantly.
2. It predicts the size of the result from your settings.
3. If that would not fit, it tells you before you start and offers a smaller setting that would.

During an export, you can see how many frames are done, how big the file is so far compared with the prediction, and how long is left.

## Getting past the ceiling

- Lower the resolution, or choose a smaller quality setting.
- Export in pieces. On Chrome and Edge, **separate files** are written into a zip on your disk one at a time, so only one piece has to fit in memory and the set as a whole can be as long as you like.
- Close other heavy tabs and programs before a big export.`,
  },
  {
    id: 'what-leaves-your-device',
    title: 'What leaves your device',
    summary: 'Your video never does. Here is the short list of what does.',
    group: 'Privacy and security',
    body: `Your video is never uploaded. It is opened, edited and exported by your own browser, and there is no option in the app that sends it anywhere. There is no fallback that sends large files to a server either.

## What the app does use the internet for

A few small things use the internet, and none of them include your video or anything about it.

- **Loading the app**, and the notes on what has changed in each update.
- **The example video**, if you choose to try one. That is a download to you, not an upload from you.
- **Signing in with a Universal ID**, only if you choose to. Nothing in Universal Video needs an account.
- **A note that the app was opened**, sent once per visit if you are signed in, so your account's activity is accurate. It does not include the name, length or size of any video.
- **An “in use” signal**, sent every 45 seconds while the app is open and on screen, so the app can show how many people are using it. It holds the app's name, a random ID created on this device, and your account if you are signed in. It says nothing about what you are working on.

There is no third-party analytics, advertising or tracking script.

## Recent files

So that you can pick up where you left off, the app keeps your most recent videos in your browser's own storage on this device. It keeps up to four, never keeps a single file larger than 100 MB, and keeps no more than 250 MB in total. Larger videos are opened but not remembered.

These copies never leave your device. You can remove any of them with the cross beside it in the list, and clearing your browser's data for this site removes them all.

## Checking for yourself

Load the app, turn off your Wi-Fi, and edit a video. Trimming, cutting, joining and exporting all keep working, because none of it was happening anywhere else.`,
  },
]

export default articles
