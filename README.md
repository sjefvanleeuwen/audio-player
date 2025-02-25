# Audio Player with Visualizer

## Skinning Guide

### Custom Control Images

The player supports custom images for all controls through CSS variables. Add these to your main CSS:

```css
audio-player {
    --play-icon: url('path/to/play.svg');
    --pause-icon: url('path/to/pause.svg');
    --prev-icon: url('path/to/rewind.svg');
    --next-icon: url('path/to/forward.svg');
    --volume-icon: url('path/to/volume.svg');
    --mute-icon: url('path/to/mute.svg');
    --speed-icon: url('path/to/speed.svg');
}
```

### Slider Customization

Customize the sliders (time and volume) with these CSS variables:

```css
audio-player {
    --slider-bg: #444;              /* Slider track background */
    --slider-height: 4px;           /* Slider track height */
    --thumb-size: 12px;             /* Slider thumb size */
    --thumb-color: white;           /* Slider thumb color */
}
```

### Recommended Image Sizes

- Control buttons: 24x24px
- Speed icon: 16x16px
- All images should be SVG or PNG with transparency

### Example Image Structure

```
/audio-player
├── images/
│   ├── play.svg
│   ├── pause.svg
│   ├── rewind.svg
│   ├── forward.svg
│   ├── volume.svg
│   ├── mute.svg
│   └── speed.svg
```

### Full Styling Example

```css
audio-player {
    /* Control Images */
    --play-icon: url('./images/play.svg');
    --pause-icon: url('./images/pause.svg');
    --prev-icon: url('./images/rewind.svg');
    --next-icon: url('./images/forward.svg');
    --volume-icon: url('./images/volume.svg');
    --mute-icon: url('./images/mute.svg');
    --speed-icon: url('./images/speed.svg');

    /* Slider Styling */
    --slider-bg: linear-gradient(to right, #666, #444);
    --slider-height: 4px;
    --thumb-size: 12px;
    --thumb-color: #fff;

    /* Optional: Container Styling */
    background: #000;
    border-radius: 8px;
    padding: 20px;
}
```

### Button States

The player automatically toggles these classes:
- `.playing` on play button when playing
- `.muted` on volume button when muted

Use these for state-specific styling:

```css
audio-player .play-button.playing {
    --pause-icon: url('./images/custom-pause.svg');
}

audio-player .volume-button.muted {
    --mute-icon: url('./images/custom-mute.svg');
}
```
