<h1 align="center">YouTube Music Player Web</h1>

> [!WARNING]
> **This project is in the testing stage and some features may be unstable and unsafe. Use at your own risk.**

> [!NOTE]
> **The project was developed using HTML, CSS, JavaScript language and [YouTube Iframe Player API](https://developers.google.com/youtube/iframe_api_reference).**

## Information

This project is a **YouTube Music Player Web Application** that allows users to stream and control YouTube videos as an interactive music player. It features a custom playlist, enabling users to select and play songs seamlessly. The app includes auto-play, repeat mode, and volume control, along with a progress bar for tracking playback. Additionally, a dark mode toggle enhances user experience. The interface is styled using Bootstrap and custom CSS animations, while JavaScript manages the YouTube IFrame API for video playback. The app also dynamically updates the background image based on the selected song, creating a visually engaging experience.

The player in this project is created using the **YouTube IFrame API**, which allows embedding and controlling YouTube videos through JavaScript.

## ✨ Enhanced Features (Fork)

This forked version includes additional features:

- **🔍 YouTube Search**: Search all of YouTube directly from the app and add songs to your playlist
- **💾 Persistent Playlist**: Your playlist is saved in browser storage and persists across sessions
- **❌ Remove Songs**: Delete songs from your playlist with a simple click
- **🔎 Playlist Search**: Filter your existing playlist to find songs quickly
- **🎨 Enhanced UI**: Improved user interface with better organization and attribution

## 🚀 Setup Instructions

### YouTube Search Functionality

To enable the YouTube search feature, you need to obtain a YouTube Data API key:

1. **Get a YouTube Data API Key**:
   - Go to the [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project or select an existing one
   - Enable the **YouTube Data API v3**
   - Create credentials (API key)
   - Restrict the API key to YouTube Data API v3 for security

2. **Add Your API Key**:
   - Open `script.js`
   - Find the line: `const YOUTUBE_API_KEY = 'YOUR_YOUTUBE_API_KEY';`
   - Replace `'YOUR_YOUTUBE_API_KEY'` with your actual API key

3. **API Usage Limits**:
   - The YouTube Data API has daily quotas
   - Each search request consumes quota units
   - For personal use, the free tier should be sufficient

### Without API Key

If you don't want to set up the YouTube API, you can still:
- Use the existing default playlist
- Manually add songs by editing the `playlist` array in `script.js`
- Search and filter your existing playlist

## 🎵 How to Use

1. **Playing Songs**: Click on any song in your playlist to play it
2. **Search YouTube**: Use the search bar to find new songs on YouTube
3. **Add Songs**: Click the "Add" button next to search results to add them to your playlist
4. **Remove Songs**: Click the trash icon next to songs in your playlist to remove them
5. **Search Playlist**: Use the playlist search bar to filter your existing songs
6. **Controls**: Use play/pause, next/previous, volume, and repeat controls
7. **Dark Mode**: Toggle dark mode for better viewing experience

## 📁 Project Structure

- `index.html` - Main application interface
- `script.js` - Core functionality and YouTube integration
- `style.css` - Styling and animations
- `README.md` - This documentation

## 🤝 Attribution

- **Original Creator**: [Jacob7179](https://github.com/Jacob7179) - Created the base YouTube Music Player
- **Original Repository**: [Jacob7179/YouTube-Music-Player-Web](https://github.com/Jacob7179/YouTube-Music-Player-Web)
- **Fork Maintainer**: [Farwalker3](https://github.com/Farwalker3) - Added enhanced features and YouTube search

## 📄 License

[![License](https://img.shields.io/github/license/Jacob7179/YouTube-Music-Player-Web?logo=github&style=for-the-badge)](LICENSE)

## 🌐 Website
[![Website](https://img.shields.io/badge/Website-Visit-blue?style=for-the-badge&logo=internet-explorer)](https://farwalker3.github.io/YouTube-Music-Player-Web/)

## 🐛 Issues & Contributions

If you encounter any issues or have suggestions for improvements:
- Check the [original repository](https://github.com/Jacob7179/YouTube-Music-Player-Web) for base functionality issues
- Open issues in this fork for enhanced features
- Contributions are welcome via pull requests

## 🔧 Development

To run this project locally:
1. Clone the repository
2. Set up your YouTube Data API key (optional, for search functionality)
3. Open `index.html` in a web browser
4. The app works entirely client-side, no server required

---

*This project builds upon the excellent work of [Jacob7179](https://github.com/Jacob7179). Thanks for creating such a solid foundation!*