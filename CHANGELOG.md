# Changelog

## [0.3.2] - 2025-11-15

### ✨ New Features
- **Auto-update system**: App automatically checks for updates on startup
- **Update dialog**: Beautiful modal interface for downloading and installing updates
- **Video downloader improvements**: Added playlist support with toggle option
- **Playlist detection**: Default behavior downloads single videos only
- **User data backup**: Automatic backup of user data (localStorage) before updates

### 🎨 UI/UX Improvements
- **Redesigned video downloader**: Modern card-based interface with gradients
- **Improved checkboxes**: Enhanced checkbox styling with smooth animations
- **Better progress bar**: Larger, more visible progress indicator with glow effect
- **Button enhancements**: Better hover effects and visual feedback
- **Update button**: Purple gradient button fixed at bottom-right corner

### 🔧 Technical Changes
- **Removed unnecessary features**: 
  - Removed quality selector (always uses best quality)
  - Removed subtitle download option
  - Removed "Downloads" page from menu (redundant)
- **Simplified options**: Only 2 essential checkboxes (Audio only, Download playlist)
- **Bundled yt-dlp**: Now includes yt-dlp binary in app, no external installation needed
- **Fixed playlist downloads**: Added `--no-playlist` flag by default, `--yes-playlist` when requested
- **Direct binary spawn**: Removed yt-dlp wrapper, now uses direct spawn with proper arguments

### 🛡️ Data Preservation
- User settings are backed up before each update
- Search history, preferences, and credentials are preserved
- Only app code is updated, user data remains intact

### 📊 Performance
- Lighter bundle with fewer features
- Hot module reloading in dev mode
- Optimized CSS with better animations

### 🐛 Bug Fixes
- Fixed video downloader downloading multiple videos from playlists
- Fixed `--stdio` pipe argument being passed to yt-dlp
- Improved error handling in update process

### 📝 Localization
- Added Portuguese translations for new features:
  - "Baixar playlist inteira" (Download entire playlist)
  - "Apenas áudio (MP3)" (Audio only MP3)
- Added English translations for all new features

### 🔄 Version History
- **v0.3.1**: Previous version with basic features
- **v0.3.0**: Initial release

---

## Installation & Update

### First Time Install
1. Download the latest executable from releases
2. Run the installer
3. Launch the app

### Auto Update
- App checks for updates on startup
- When an update is available, a dialog appears
- Click "Download" to download the update
- Once downloaded, click "Install and Restart" to apply it
- Your data will be automatically preserved

### Manual Update Check
- Click the "🔄 Check for updates" button in the bottom right corner
- Or wait for the automatic check (happens on app startup)

---

## What's Changed in 0.3.2

### Before (0.3.1)
- ❌ Manual installation of yt-dlp required
- ❌ Downloads could get stuck with multiple videos from playlists
- ❌ User had to manually select quality
- ❌ No automatic update checking
- ❌ Data might be lost during updates
- ❌ Confusing "Downloads" page in menu

### After (0.3.2)
- ✅ yt-dlp bundled in app - just works!
- ✅ Single video downloads by default
- ✅ Best quality always selected
- ✅ Automatic update checking on startup
- ✅ User data automatically backed up and restored
- ✅ Cleaner menu with only essential features

---

## Known Limitations
- Update system requires internet connection
- App must be run with permissions to install updates
- Auto-update only works with packaged/distributed version (not dev builds)

## Future Plans
- [ ] Add support for more video platforms (TikTok, Instagram, etc.)
- [ ] Implement parallel downloads
- [ ] Add download queue management
- [ ] Support for custom video filters
- [ ] WebUI for remote access

