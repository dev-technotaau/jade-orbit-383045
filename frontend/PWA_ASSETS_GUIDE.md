# PWA Assets Creation Guide

This guide lists all the icon files and screenshots needed for the enhanced PWA manifest.

## 📱 Required Icon Files

Place all icons in `frontend/public/`:

### Standard Icons (purpose: 'any')
- [ ] `icon-72x72.png` - 72×72px
- [ ] `icon-96x96.png` - 96×96px
- [ ] `icon-128x128.png` - 128×128px
- [ ] `icon-144x144.png` - 144×144px
- [ ] `icon-152x152.png` - 152×152px
- [ ] `icon-192x192.png` - 192×192px
- [ ] `icon-384x384.png` - 384×384px
- [ ] `icon-512x512.png` - 512×512px

### Maskable Icons (Android adaptive icons)
- [x] `web-app-manifest-192x192.png` - 192×192px (already exists)
- [x] `web-app-manifest-512x512.png` - 512×512px (already exists)

**Maskable Icon Requirements:**
- Must have safe zone (80% of image)
- No transparency in edges
- Use https://maskable.app/ to test

## 📸 Required Screenshots

Place in `frontend/public/screenshots/`:

### Mobile Screenshots (narrow form factor)
- [ ] `home-mobile.png` - 390×844px (iPhone 14 Pro size)
- [ ] `jobs-mobile.png` - 390×844px
- [ ] `profile-mobile.png` - 390×844px

### Desktop Screenshots (wide form factor)
- [ ] `home-desktop.png` - 1920×1080px

**Screenshot Requirements:**
- Should show actual app UI
- No device frames (just the content)
- High quality PNG
- Representative of key features

## 🔗 Required Shortcut Icons

Place in `frontend/public/shortcuts/`:

- [ ] `search-jobs.png` - 96×96px
- [ ] `profile.png` - 96×96px
- [ ] `applications.png` - 96×96px
- [ ] `post-job.png` - 96×96px

## 🎨 Icon Design Guidelines

### Brand Colors
- Primary: `#2563EB` (blue)
- Background: `#FFFFFF` (white)

### Design Specs
1. **Flat Design**: Use modern, flat design principles
2. **Recognizable**: Should be identifiable at small sizes
3. **Consistent**: Use same color palette across all icons
4. **Simple**: Avoid complex details that don't scale down well

### Recommended Tools
- **Figma/Adobe Illustrator**: Design icons as vectors
- **ImageMagick**: Batch resize to multiple sizes
- **Squoosh**: Optimize PNG files
- **Maskable.app**: Test maskable icons

## 🔧 Batch Icon Generation

If you have a single SVG source icon, use this script to generate all sizes:

```bash
# Install ImageMagick first: brew install imagemagick (macOS) or apt-get install imagemagick (Linux)

# Generate all icon sizes from SVG
for size in 72 96 128 144 152 192 384 512; do
  convert icon.svg -resize ${size}x${size} icon-${size}x${size}.png
done

# For maskable icons (with padding)
for size in 192 512; do
  convert icon.svg -resize ${size}x${size} -background white -gravity center -extent ${size}x${size} web-app-manifest-${size}x${size}.png
done
```

## 📦 Optional: Favicon Sizes

While not strictly required for PWA, these are good for browser compatibility:

- [ ] `favicon.ico` - 16×16, 32×32, 48×48 (multi-size ICO)
- [ ] `apple-touch-icon.png` - 180×180px (iOS home screen)
- [ ] `favicon-16x16.png`
- [ ] `favicon-32x32.png`

## ✅ Verification Checklist

After creating all assets:

- [ ] Test manifest with Chrome DevTools → Application → Manifest
- [ ] Verify all icon paths resolve (no 404s)
- [ ] Test "Add to Home Screen" on Android/iOS
- [ ] Verify shortcuts appear on Android (long-press app icon)
- [ ] Test maskable icons with https://maskable.app/
- [ ] Run Lighthouse PWA audit (should score 100%)

## 🚀 Quick Start (Temporary Workaround)

If you want to test PWA features immediately without all icons:

1. Copy existing `web-app-manifest-192x192.png` to all missing icon sizes:
   ```bash
   cd frontend/public
   for size in 72 96 128 144 152 192 384 512; do
     cp web-app-manifest-192x192.png icon-${size}x${size}.png
   done
   ```

2. Create placeholder screenshots (can be any PNG for testing)

3. Deploy and test PWA installation

4. Replace with proper assets later for production

## 📚 Resources

- [PWA Manifest Generator](https://www.simicart.com/manifest-generator.html/)
- [Maskable Icon Editor](https://maskable.app/editor)
- [PWA Asset Generator](https://github.com/elegantapp/pwa-asset-generator)
- [Google PWA Checklist](https://web.dev/pwa-checklist/)
