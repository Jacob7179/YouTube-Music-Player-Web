let player;
let playing = false;
let songUnavailable = false;
let progressInterval;
let isDragging = false;
let errorTimeout;
let selectedVideoId;
let countdownInterval;
let darkModeToggleInProgress = false;
let actualSelectedVideoId = null;
let albumArtDisplayMode = localStorage.getItem("albumArtDisplayMode") || "spin";
let albumArtSpinEnabled = albumArtDisplayMode === "spin";
let isTranslating = false;
let showTranslatedView = false;

// YOUTUBE_API_KEY is now loaded from config.js or Vercel API endpoint
const VERCEL_API_KEY_ENDPOINT = '/api/getApiKey';
let cachedApiKey = null;

async function getApiKey() {
    if (cachedApiKey) return cachedApiKey;

    // 1. Try config.js (global variable)
    if (typeof YOUTUBE_API_KEY !== 'undefined' && 
        YOUTUBE_API_KEY && 
        YOUTUBE_API_KEY !== 'YOUR_YOUTUBE_API_KEY') {
        cachedApiKey = YOUTUBE_API_KEY;
        return cachedApiKey;
    }

    // 2. Fallback: fetch from Vercel serverless function
    try {
        const response = await fetch(VERCEL_API_KEY_ENDPOINT);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const data = await response.json();
        if (data.apiKey) {
            cachedApiKey = data.apiKey;
            return cachedApiKey;
        } else {
            throw new Error('No apiKey in response');
        }
    } catch (error) {
        console.warn('Could not fetch API key from Vercel:', error);
        throw new Error('No API key available. Please set YOUTUBE_API_KEY in config.js or Vercel environment.');
    }
}

// Search Cache to minimize API calls for repeated searches
const searchCache = JSON.parse(localStorage.getItem('ytSearchCache') || '{}');
const CACHE_EXPIRY = 3600000; // 1 hour in milliseconds
let searchTimeout;

// CORS Proxy URL - Used to bypass CORS restrictions for YouTube API calls
// You can change this if you find a more reliable proxy.
const CORS_PROXIES = [
    'https://cors-proxy.jacobng9022.workers.dev/?url=', // Custom proxy (Cloudflare Worker)
    'https://corsproxy.io/?',
    'https://api.codetabs.com/v1/proxy?quest=',
    'https://api.allorigins.win/raw?url=',
    'https://thingproxy.freeboard.io/fetch/'
];
// const CORS_PROXY_URL = 'https://cors-anywhere.herokuapp.com/'; // Requires authorization

let playlist = []; // Array to store playlist data

// Define icon HTML as constants to prevent syntax issues
const ICON_TRASH = '<i class=\'bx bx-trash\'></i>';
const ICON_PLUS = '<i class=\'bx bx-plus\'></i>';
const ICON_PLAY = '<i class=\'bx bx-play\' style=\'color: white; font-size: 24px;\'></i>';
const ICON_PAUSE = '<i class=\'bx bx-pause\' style=\'color: white; font-size: 24px;\'></i>';
const ICON_REVISION = '<i class=\'bx bx-revision\' style=\'color: white; font-size: 24px;\'></i>';
const ICON_PREVIOUS = '<i class=\'bx bx-skip-previous\' ></i>';
const ICON_NEXT = '<i class=\'bx bx-skip-next\' ></i>';
const ICON_REPEAT = '<i class=\'bx bx-repeat\' ></i>';

// Add toggle functionality for song list/lyrics
document.addEventListener('DOMContentLoaded', function() {
    const showSongListBtn = document.getElementById('showSongListBtn');
    const showLyricsBtn = document.getElementById('showLyricsBtn');
    const songListContainer = document.getElementById('songListContainer');
    const lyricsContainer = document.getElementById('lyricsContainer');
    const playlistSearchContainer = document.getElementById('playlistSearchContainer');

    // Initialize based on saved preference
    const showLyrics = localStorage.getItem('showLyrics') === 'true';
    
    if (showLyrics) {
        showLyricsView();
    } else {
        showSongListView();
    }

    // Song List button click
    showSongListBtn.addEventListener('click', function() {
        if (!songListContainer.classList.contains('d-none')) return;
        showSongListView();
        localStorage.setItem('showLyrics', 'false');
    });

    // Lyrics button click
    showLyricsBtn.addEventListener('click', function() {
        if (!lyricsContainer.classList.contains('d-none')) return;
        showLyricsView();
        localStorage.setItem('showLyrics', 'true');
    });

    function showSongListView() {
        // Show song list
        songListContainer.classList.remove('d-none');
        playlistSearchContainer.classList.remove('d-none');
        
        // Hide lyrics
        lyricsContainer.classList.add('d-none');
        
        // Update button states
        showSongListBtn.classList.add('active');
        showSongListBtn.classList.remove('btn-outline-primary');
        showSongListBtn.classList.add('btn-primary');
        
        showLyricsBtn.classList.remove('active');
        showLyricsBtn.classList.remove('btn-primary');
        showLyricsBtn.classList.add('btn-outline-primary');
    }

    function showLyricsView() {
        // Show lyrics
        lyricsContainer.classList.remove('d-none');
        
        // Hide song list
        songListContainer.classList.add('d-none');
        playlistSearchContainer.classList.add('d-none');
        
        // Update button states
        showLyricsBtn.classList.add('active');
        showLyricsBtn.classList.remove('btn-outline-primary');
        showLyricsBtn.classList.add('btn-primary');
        
        showSongListBtn.classList.remove('active');
        showSongListBtn.classList.remove('btn-primary');
        showSongListBtn.classList.add('btn-outline-primary');
    }
});

// Load playlist from local storage or use a default if none exists
function loadPlaylist() {
    const storedPlaylist = localStorage.getItem('youtubeMusicPlaylist');
    if (storedPlaylist) {
        playlist = JSON.parse(storedPlaylist);
    } else {
        // Default playlist if local storage is empty
        playlist = [
            { videoId: '7OHstJwaKoU', songName: '何千キロの君へ', authorName: 'SHIN - Topic', albumArt: 'https://i.ytimg.com/vi/7OHstJwaKoU/hqdefault.jpg' },
            { videoId: 'dh00du4hOGM', songName: '清夏', authorName: 'SHIN - Topic', albumArt: 'https://i.ytimg.com/vi/dh00du4hOGM/hqdefault.jpg' },
            { videoId: 'eJpkUecGyMI', songName: '恋花', authorName: 'SHIN - Topic', albumArt: 'https://i.ytimg.com/vi/eJpkUecGyMI/hqdefault.jpg' },
            { videoId: 'dzniwGFO79g', songName: 'ハルカスミ', authorName: 'SHIN - Topic', albumArt: 'https://i.ytimg.com/vi/dzniwGFO79g/hqdefault.jpg' },
            { videoId: 'TQ8WlA2GXbk', songName: 'Official髭男dism - Pretender［Official Video］', authorName: 'Official髭男dism', albumArt: 'https://i.ytimg.com/vi/TQ8WlA2GXbk/hqdefault.jpg' },
            { videoId: 'cqzyiJE4SQE', songName: '笑顔の待つ場所', authorName: 'Official髭男dism', albumArt: 'https://i.ytimg.com/vi/cqzyiJE4SQE/hqdefault.jpg' },
            { videoId: 'iURMyl-jarE', songName: '明け方のゲッタウェイ (Live)', authorName: 'Official髭男dism', albumArt: 'https://i.ytimg.com/vi/iURMyl-jarE/hqdefault.jpg' },
            { videoId: '86uTlHDIbAw', songName: 'ダッフルコートノアマイユメ_オリジナル', authorName: 'Satoshi Fujihara', albumArt: 'https://i.ytimg.com/vi/86uTlHDIbAw/hqdefault.jpg' },
            { videoId: 'sPAJ6mTxNCU', songName: 'ふりだす雨、ゴキゲンな君', authorName: 'Official髭男dism', albumArt: 'https://i.ytimg.com/vi/sPAJ6mTxNCU/hqdefault.jpg' },
            { videoId: 'DuMqFknYHBs', songName: 'Official髭男dism - イエスタデイ［Official Video］', authorName: 'Official髭男dism', albumArt: 'https://i.ytimg.com/vi/DuMqFknYHBs/hqdefault.jpg' },
            { videoId: 'aRtoPwe4ado', songName: 'Sanitizer', authorName: 'OFFICIAL HIGE DANDISM - Topic', albumArt: 'https://i.ytimg.com/vi/aRtoPwe4ado/hqdefault.jpg' },
            { videoId: 'l2nqfPAMrSo', songName: 'Chessboard', authorName: 'OFFICIAL HIGE DANDISM - Topic', albumArt: 'https://i.ytimg.com/vi/l2nqfPAMrSo/hqdefault.jpg' },
            { videoId: 'SICzNfWhgn8', songName: 'みどりの雨避け', authorName: 'OFFICIAL HIGE DANDISM - Topic', albumArt: 'https://i.ytimg.com/vi/SICzNfWhgn8/hqdefault.jpg' },
            { videoId: 'hJqYc62NCKo', songName: 'TheFatRat & Laura Brehm - We\'ll Meet Again', authorName: 'TheFatRat', albumArt: 'https://i.ytimg.com/vi/hJqYc62NCKo/hqdefault.jpg' },
            { videoId: 'dpT-TeRYFvY', songName: 'All For Love', authorName: 'Tungevaag & Raaban - Topic', albumArt: 'https://i.ytimg.com/vi/dpT-TeRYFvY/hqdefault.jpg' },
        ];
    }
    renderPlaylist(playlist);
}

function savePlaylist() {
    localStorage.setItem('youtubeMusicPlaylist', JSON.stringify(playlist));
}

// Helper function to scroll playlist without focusing the window
function scrollToSelectedSong() {
    const selectedSong = document.querySelector("#songList li.selected");
    const songList = document.getElementById("songList");
    
    if (!selectedSong || !songList) return;
    
    // Calculate positions relative to the playlist container
    const songRect = selectedSong.getBoundingClientRect();
    const listRect = songList.getBoundingClientRect();
    
    // Check if selected song is not fully visible in the playlist
    const isNotFullyVisible = 
        songRect.top < listRect.top || 
        songRect.bottom > listRect.bottom;
    
    // Only scroll if the song is not visible in the playlist viewport
    if (isNotFullyVisible) {
        // Scroll the playlist container without focusing the window
        const scrollTop = selectedSong.offsetTop - songList.offsetTop - (songList.clientHeight / 2) + (selectedSong.offsetHeight / 2);
        
        songList.scrollTo({
            top: scrollTop,
            behavior: "smooth"
        });
    }
}

// In the renderPlaylist function, replace the list item creation with:
function renderPlaylist(songsToRender) {
    const songListElement = document.getElementById('songList');
    const currentlySelectedVideoId = actualSelectedVideoId || (player ? player.getVideoData().video_id : null);
    
    songListElement.innerHTML = ''; // Clear existing list

    if (songsToRender.length === 0) {
        const emptyItem = document.createElement('li');
        emptyItem.classList.add('list-group-item', 'text-center', 'text-muted', 'empty-playlist');
        emptyItem.textContent = 'No songs in playlist. Add some using the YouTube search below!';
        songListElement.appendChild(emptyItem);
        return;
    }

    songsToRender.forEach((song, index) => {
        const listItem = document.createElement('li');
        listItem.classList.add('list-group-item', 'd-flex', 'justify-content-between', 'align-items-center');
        listItem.setAttribute('data-video', song.videoId);
        listItem.setAttribute('data-img', song.albumArt);
        listItem.setAttribute('draggable', 'true');
        listItem.setAttribute('data-index', index);

        // ✅ Preserve selection - check if this is the actual selected song
        if (song.videoId === currentlySelectedVideoId) {
            listItem.classList.add('selected');
        }

        // Column 0: Drag Handle
        const dragHandleSpan = document.createElement('span');
        dragHandleSpan.classList.add('drag-handle');
        dragHandleSpan.innerHTML = '<i class="bx bx-menu"></i>';
        dragHandleSpan.setAttribute('title', translations[currentLang].dragToReorder);

        // Column 1: Number - Simple 1. 2. 3. format
        const songNumberSpan = document.createElement('span');
        songNumberSpan.classList.add('song-number');
        songNumberSpan.textContent = `${index + 1}.`;

        // Column 2: Song Name - Clean, no author name
        const songNameSpan = document.createElement('span');
        songNameSpan.classList.add('song-name');
        
        // Clean the song name - remove author name if it's included
        let cleanSongName = song.songName;
        cleanSongName = cleanSongName.replace(new RegExp(`^${song.authorName}\\s*-\\s*`), '');
        cleanSongName = cleanSongName.replace(new RegExp(`\\s*-\\s*${song.authorName}$`), '');
        cleanSongName = cleanSongName.replace(new RegExp(`\\s*by\\s*${song.authorName}$`, 'i'), '');
        
        songNameSpan.textContent = cleanSongName;

        // Column 3: Author Name - Separate column
        const authorColumnSpan = document.createElement('span');
        authorColumnSpan.classList.add('author-column');
        authorColumnSpan.textContent = song.authorName;

        // Column 4: Action
        const actionDiv = document.createElement('div');
        actionDiv.classList.add('song-action');

        const removeButton = document.createElement('button');
        removeButton.classList.add('btn', 'btn-danger', 'btn-sm', 'remove-song-btn');
        removeButton.innerHTML = ICON_TRASH;
        removeButton.setAttribute('data-video', song.videoId);
        removeButton.setAttribute('title', translations[currentLang].removeSongTitle);

        // Assemble the structure - 5 columns now (including drag handle)
        listItem.appendChild(songNumberSpan);      // Order: 1
        listItem.appendChild(songNameSpan);        // Order: 2  
        listItem.appendChild(authorColumnSpan);    // Order: 3
        listItem.appendChild(dragHandleSpan);      // Order: 4
        actionDiv.appendChild(removeButton);
        listItem.appendChild(actionDiv);

        songListElement.appendChild(listItem);

        // Add drag and drop event listeners
        initDragAndDrop(listItem);

        // Add click listener to play song (click anywhere on the row except drag handle and remove button)
        listItem.addEventListener('click', function (event) {
            // Don't trigger if drag handle or remove button was clicked
            if (event.target.closest('.drag-handle') || event.target.closest('.remove-song-btn')) {
                return;
            }
            
            // Remove highlight from previous selection
            document.querySelectorAll('#songList li').forEach(li => li.classList.remove('selected'));
            // Highlight the clicked song
            listItem.classList.add('selected');

            // ✅ Update the actual selected video ID
            actualSelectedVideoId = song.videoId;

            loadNewVideo(song.videoId, song.albumArt, song);
            scrollToSelectedSong();
        });

        // Add click listener to remove song
        removeButton.addEventListener('click', function (event) {
            event.stopPropagation(); // Prevent playing the song when removing
            removeSong(song.videoId);
        });
    });

    // Reapply dark mode if enabled
    if (document.body.classList.contains('dark-mode')) {
        applyDarkModeToElements(true);
    }

    // Apply current language
    applyLanguage(currentLang);

    // ✅ Only auto-select first song on VERY FIRST page load (when player doesn't exist)
    if (!player && songsToRender.length > 0) {
        const searchInput = document.getElementById('searchPlaylistInput');
        // ✅ Only auto-select if NOT searching (search input is empty)
        if (!searchInput || searchInput.value.trim() === '') {
            const firstSongElement = document.querySelector('#songList li');
            if (firstSongElement) {
                firstSongElement.classList.add('selected');
                const firstVideoId = firstSongElement.getAttribute('data-video');
                const firstAlbumArtUrl = firstSongElement.getAttribute('data-img');
                const firstSongObj = songsToRender[0];

                // ✅ Update the actual selected video ID
                actualSelectedVideoId = firstVideoId;

                // ✅ Immediately update UI without autoplay
                document.getElementById("albumArt").src = firstAlbumArtUrl;
                document.getElementById("background").style.backgroundImage = `url('${firstAlbumArtUrl}')`;
                
                // Clean the song name for display
                let cleanSongName = firstSongObj.songName;
                cleanSongName = cleanSongName.replace(new RegExp(`^${firstSongObj.authorName}\\s*-\\s*`), '');
                cleanSongName = cleanSongName.replace(new RegExp(`\\s*-\\s*${firstSongObj.authorName}$`), '');
                cleanSongName = cleanSongName.replace(new RegExp(`\\s*by\\s*${firstSongObj.authorName}$`, 'i'), '');
                
                document.querySelector("#nowPlaying .song-title").innerText = cleanSongName;
                document.querySelector("#nowPlaying .author-name").innerText = firstSongObj.authorName;
                loadLyricsFor(firstSongObj.songName, firstSongObj.authorName);

                // Only prepare player, don't autoplay
                selectedVideoId = firstVideoId;
                onYouTubeIframeAPIReady();
            }
        }
    }
}

// Drag and Drop functionality
function initDragAndDrop(item) {
    let isDragging = false;
    let dragStartY = 0;
    let currentDragItem = null;
    let dragPreview = null;

    const dragHandle = item.querySelector('.drag-handle');
    
    // Mouse down event on drag handle
    dragHandle.addEventListener('mousedown', startDrag);
    dragHandle.addEventListener('touchstart', startDrag, { passive: false });

    function startDrag(e) {
        e.preventDefault();
        e.stopPropagation();
        
        if (e.type === 'touchstart') {
            e = e.touches[0];
        }
        
        isDragging = true;
        currentDragItem = item;
        dragStartY = e.clientY - item.getBoundingClientRect().top;
        
        // Create drag preview
        createDragPreview(item, e.clientX, e.clientY);
        
        // Add dragging class
        item.classList.add('dragging');
        
        // Add event listeners for dragging
        document.addEventListener('mousemove', onDrag);
        document.addEventListener('touchmove', onDrag, { passive: false });
        document.addEventListener('mouseup', stopDrag);
        document.addEventListener('touchend', stopDrag);
        
        // Prevent text selection during drag
        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'grabbing';
    }

    function onDrag(e) {
        if (!isDragging) return;
        
        e.preventDefault();
        
        let clientY;
        if (e.type === 'touchmove') {
            clientY = e.touches[0].clientY;
        } else {
            clientY = e.clientY;
        }
        
        // Update drag preview position
        if (dragPreview) {
            dragPreview.style.left = e.clientX + 'px';
            dragPreview.style.top = (clientY - 10) + 'px';
        }
        
        // Handle drag over other items
        const songList = document.getElementById('songList');
        const items = Array.from(songList.querySelectorAll('.list-group-item:not(.dragging):not(.empty-playlist)'));
        
        // Clear previous drag-over classes
        items.forEach(el => {
            el.classList.remove('drag-over-top', 'drag-over-bottom');
        });
        
        // Find the closest drop target
        const closestItem = findClosestItem(items, clientY);
        
        if (closestItem) {
            const rect = closestItem.getBoundingClientRect();
            const midpoint = rect.top + rect.height / 2;
            
            if (clientY < midpoint) {
                closestItem.classList.add('drag-over-top');
            } else {
                closestItem.classList.add('drag-over-bottom');
            }
        }
    }

    function stopDrag(e) {
        if (!isDragging) return;
        
        isDragging = false;
        
        let clientY;
        if (e.type === 'touchend') {
            clientY = e.changedTouches[0].clientY;
        } else {
            clientY = e.clientY;
        }
        
        // Remove dragging class
        item.classList.remove('dragging');
        
        // Remove drag preview
        removeDragPreview();
        
        // Clear all drag-over classes
        document.querySelectorAll('#songList .list-group-item').forEach(el => {
            el.classList.remove('drag-over-top', 'drag-over-bottom');
        });
        
        // Handle the drop
        handleDrop(clientY);
        
        // Remove event listeners
        document.removeEventListener('mousemove', onDrag);
        document.removeEventListener('touchmove', onDrag);
        document.removeEventListener('mouseup', stopDrag);
        document.removeEventListener('touchend', stopDrag);
        
        // Restore cursor and selection
        document.body.style.userSelect = '';
        document.body.style.cursor = 'default';

        document.querySelectorAll('*').forEach(el => {
            el.style.cursor = '';
        });
    }

    function findClosestItem(items, clientY) {
        return items.reduce((closest, item) => {
            const rect = item.getBoundingClientRect();
            const offset = Math.abs(clientY - (rect.top + rect.height / 2));
            
            if (offset < closest.offset) {
                return { offset, element: item };
            }
            return closest;
        }, { offset: Number.POSITIVE_INFINITY, element: null }).element;
    }

    function handleDrop(clientY) {
        const songList = document.getElementById('songList');
        const items = Array.from(songList.querySelectorAll('.list-group-item:not(.empty-playlist)'));
        const draggingIndex = items.indexOf(currentDragItem);
        
        // Find drop target
        const targetItem = findClosestItem(items.filter(item => item !== currentDragItem), clientY);
        
        if (targetItem) {
            const targetIndex = items.indexOf(targetItem);
            const rect = targetItem.getBoundingClientRect();
            const midpoint = rect.top + rect.height / 2;
            
            let newIndex;
            if (clientY < midpoint) {
                // Insert above target
                newIndex = targetIndex;
            } else {
                // Insert below target
                newIndex = targetIndex + 1;
            }
            
            // Adjust for the fact that we're removing the dragging item first
            if (newIndex > draggingIndex) {
                newIndex--;
            }
            
            // Only reorder if position actually changed
            if (newIndex !== draggingIndex) {
                // Reorder the playlist array
                const movedSong = playlist.splice(draggingIndex, 1)[0];
                playlist.splice(newIndex, 0, movedSong);
                
                // Save the reordered playlist
                savePlaylist();
                
                // Re-render the playlist to update numbers and maintain selection
                const currentlySelectedVideoId = actualSelectedVideoId;
                renderPlaylist(playlist);
                
                // Restore selection after re-render
                if (currentlySelectedVideoId) {
                    const selectedItem = document.querySelector(`#songList li[data-video="${currentlySelectedVideoId}"]`);
                    if (selectedItem) {
                        selectedItem.classList.add('selected');
                        actualSelectedVideoId = currentlySelectedVideoId;
                    }
                }
            }
        }
    }

    function createDragPreview(sourceItem, x, y) {
        dragPreview = document.createElement('div');
        dragPreview.className = 'drag-preview';
        
        // Clone the content (simplified version)
        const songName = sourceItem.querySelector('.song-name').textContent;
        const authorName = sourceItem.querySelector('.author-column').textContent;
        
        dragPreview.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px;">
                <i class="bx bx-menu" style="color: #6c757d;"></i>
                <span style="font-weight: 500;">${songName}</span>
                <span style="color: #6c757d; font-size: 0.9em;">${authorName}</span>
            </div>
        `;
        
        document.body.appendChild(dragPreview);
        dragPreview.style.left = x + 'px';
        dragPreview.style.top = (y - 10) + 'px';
    }

    function removeDragPreview() {
        if (dragPreview) {
            document.body.removeChild(dragPreview);
            dragPreview = null;
        }
    }

    // Prevent default drag behavior
    item.addEventListener('dragstart', (e) => {
        e.preventDefault();
        return false;
    });
}

// Remove song functionality
function removeSong(videoIdToRemove) {
    // 🧩 Safely get currently playing video ID (avoid crash if player not ready)
    let currentPlayingVideoId = null;
    try {
        if (player && typeof player.getVideoData === "function") {
            const data = player.getVideoData();
            if (data && data.video_id) currentPlayingVideoId = data.video_id;
        }
    } catch (e) {
        console.warn("⚠️ player.getVideoData() not ready yet:", e);
    }

    const wasPlayingCurrent = currentPlayingVideoId === videoIdToRemove && playing;

    // 🧹 Remove song from playlist
    playlist = playlist.filter(song => song.videoId !== videoIdToRemove);
    savePlaylist();
    renderPlaylist(playlist);

    // ✅ Clear selection if the removed song was selected
    if (actualSelectedVideoId === videoIdToRemove) {
        actualSelectedVideoId = null;
    }

    // 🎵 If the removed song was currently playing
    if (wasPlayingCurrent) {
        if (playlist.length > 0) {
            // ▶️ Play the next song in the updated playlist
            playNextSong();
        } else {
            // 🛑 No songs left → stop playback and reset UI safely
            if (player && typeof player.stopVideo === "function") {
                player.stopVideo();
            } else {
                console.warn("⚠️ player.stopVideo() not available yet — skipping stop.");
            }

            playing = false;
            document.getElementById("playPauseBtn").innerHTML = ICON_PLAY;
            document.getElementById("albumArt").src = "https://via.placeholder.com/300";
            document.querySelector("#nowPlaying .song-title").innerText = "No Song";
            document.querySelector("#nowPlaying .author-name").innerText = "";
            document.getElementById("progress").style.width = "0%";
            document.getElementById("currentTime").innerText = "0:00";
            document.getElementById("totalTime").innerText = "0:00";
            document.getElementById("background").style.backgroundImage = "none";

            if (typeof progressInterval !== "undefined" && progressInterval) {
                clearInterval(progressInterval);
            }

            // ✅ Clear selection when playlist is empty
            actualSelectedVideoId = null;
        }
    }
}

// Playlist Search functionality (for filtering the current playlist)
document.getElementById('searchPlaylistInput').addEventListener('input', function () {
    const searchTerm = this.value.toLowerCase();
    const clearBtn = document.getElementById('clearPlaylistSearchBtn');
    const t = translations[currentLang];
    
    // Show/hide clear button based on whether there's text
    if (searchTerm.trim().length > 0) {
        clearBtn.classList.remove('d-none');
        clearBtn.setAttribute('title', t.clearSearch || 'Clear search');
        this.classList.remove('rounded-end');
    } else {
        clearBtn.classList.add('d-none');
        this.classList.add('rounded-end');
    }
    
    const filteredSongs = playlist.filter(song =>
        song.songName.toLowerCase().includes(searchTerm) ||
        song.authorName.toLowerCase().includes(searchTerm)
    );
    renderPlaylist(filteredSongs);
});

document.getElementById('clearPlaylistSearchBtn').addEventListener('click', function () {
    const searchInput = document.getElementById('searchPlaylistInput');
    const clearBtn = document.getElementById('clearPlaylistSearchBtn');
    
    searchInput.value = '';
    clearBtn.classList.add('d-none'); // Hide the clear button
    searchInput.classList.add('rounded-end');
    renderPlaylist(playlist);
    
    // Focus back on the search input after clearing
    searchInput.focus();
});

// YouTube Search Functionality
document.getElementById('youtubeSearchBtn').addEventListener('click', searchYouTube);
// Add debouncing to search input
document.getElementById('youtubeSearchInput').addEventListener('input', function(event) {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        if (this.value.trim().length > 2) { // Only search after 3+ characters
            searchYouTube();
        }
    }, 500); // Wait 500ms after typing stops
});

// Keep the Enter key functionality
document.getElementById('youtubeSearchInput').addEventListener('keypress', function(event) {
    if (event.key === 'Enter') {
        clearTimeout(searchTimeout);
        searchYouTube();
    }
});

async function searchYouTube() {
    let apiKey;
    try {
        apiKey = await getApiKey();
    } catch (error) {
        console.error('Error fetching API key:', error);
    }

    console.log("Attempting YouTube search...");
    console.log("API Key present (from config.js): ", typeof apiKey !== 'undefined' && apiKey.length > 10);

    const searchTerm = document.getElementById('youtubeSearchInput').value.trim();
    const searchResultsList = document.getElementById('searchResultsList');
    const searchLoading = document.getElementById('searchLoading');
    const searchError = document.getElementById('searchError');
    const searchResultsContainer = document.getElementById('searchResults');
    const t = translations[currentLang];

    searchResultsList.innerHTML = ''; // Clear previous results
    searchError.classList.add('d-none'); // Hide error message
    searchResultsContainer.classList.add('d-none'); // Hide results container initially

    if (!searchTerm) {
        return;
    }

    // Check cache first
    const cachedResults = getCachedResults(searchTerm);
    if (cachedResults) {
        console.log("Using cached results for:", searchTerm);
        displaySearchResults(cachedResults);
        return;
    }

    if (typeof apiKey === 'undefined' || apiKey === 'YOUR_YOUTUBE_API_KEY') {
        // Use innerHTML to properly structure the error message
        searchError.innerHTML = `<i class='bx bx-error'></i> ${t.youtubeApiKeyError}`;
        searchError.classList.remove('d-none');
        searchLoading.classList.add('d-none');
        return;
    }

    searchLoading.classList.remove('d-none'); // Show loading indicator

    try {
        // Construct the URL for the YouTube API call - Direct call, without proxy
        const youtubeApiUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(searchTerm)}&type=video&maxResults=10&key=${apiKey}`;
        
        console.log("Fetching directly from YouTube API:", youtubeApiUrl);

        // Directly call the YouTube API (the YouTube API should support CORS)
        const response = await fetch(youtubeApiUrl);
        
        if (!response.ok) {
            const errorText = await response.text(); // Get raw text for more info
            console.error('YouTube API Error:', response.status, response.statusText, errorText);
            
            // Handle specific error codes with translations
            if (response.status === 403) {
                searchError.innerHTML = `<i class='bx bx-error'></i> ${t.youtubeApi403Error}`;
            } else if (response.status === 400) {
                searchError.innerHTML = `<i class='bx bx-error'></i> ${t.youtubeApiKeyError}`;
            } else {
                searchError.innerHTML = `<i class='bx bx-error'></i> ${t.youtubeSearchError || `YouTube API Error: ${response.status} ${response.statusText}`}`;
            }
            
            searchError.classList.remove('d-none');
            searchLoading.classList.add('d-none');
            return;
        }

        const data = await response.json();

        // Cache the results
        cacheSearchResults(searchTerm, data);

        searchLoading.classList.add('d-none'); // Hide loading indicator
        searchResultsContainer.classList.remove('d-none'); // Show results container

        if (data.items && data.items.length > 0) {
            data.items.forEach(item => {
                if (item.id.videoId) { // Ensure it's a video
                    const videoId = item.id.videoId;
                    const title = item.snippet.title;
                    const channelTitle = item.snippet.channelTitle;
                    const thumbnailUrl = item.snippet.thumbnails.high.url;

                    const resultItem = document.createElement('div');
                    resultItem.classList.add('list-group-item', 'list-group-item-action', 'd-flex', 'align-items-center', 'mb-2', 'rounded');
                    resultItem.innerHTML = `
                        <img src="${thumbnailUrl}" alt="${title}" class="me-3 rounded" style="width: 80px; height: 45px; object-fit: cover;">
                        <div class="flex-grow-1">
                            <h6 class="mb-1">${title}</h6>
                            <p class="mb-0 text-muted"><small>${channelTitle}</small></p>
                        </div>
                        <button class="btn btn-success btn-sm add-from-search-btn" title="${t.addToPlaylist}"
                                data-video-id="${videoId}" 
                                data-song-title="${title.replace(/"/g, '&quot;')}" 
                                data-author-name="${channelTitle.replace(/"/g, '&quot;')}" 
                                data-album-art="${thumbnailUrl}">
                            ${t.add}
                        </button>
                    `;
                    searchResultsList.appendChild(resultItem);
                }
            });
            // Add event listeners to the new add buttons
            document.querySelectorAll('.add-from-search-btn').forEach(button => {
                button.addEventListener('click', addSongFromSearch);
            });

            // Reapply dark mode if enabled
            if (document.body.classList.contains('dark-mode')) {
                applyDarkModeToElements(true);
            }

        } else {
            searchResultsList.innerHTML = `<p class="text-center text-muted">${t.noResultsFound}</p>`;
        }

    } catch (error) {
        console.error('Error searching YouTube:', error);
        searchLoading.classList.add('d-none');
        
        // If it's a CORS error, display a specific message.
        if (error.message.includes('CORS') || error.message.includes('NetworkError')) {
            searchError.innerHTML = `<i class='bx bx-error'></i> ${t.youtubeSearchError}<br><small>If this error persists, please check your network connection or use other methods to add songs.</small>`;
        } else {
            searchError.innerHTML = `<i class='bx bx-error'></i> ${t.youtubeSearchError}`;
        }
        searchError.classList.remove('d-none');
    }
}

// 🎵 Handle add_song URL param — Always fetch title + author, and alert user
async function handleAddSongFromURL() {
    let apiKey;
    try {
        apiKey = await getApiKey();
    } catch (e) {
        console.error('Error fetching API key:', e);
    }
    const params = new URLSearchParams(window.location.search);
    let songLink = params.get("add_song");
    if (!songLink) return;

    const t = translations[currentLang];

    // Remove &si=xxxx parameter if it exists
    songLink = songLink.replace(/&si=[^&]*/i, '');
    
    // Also handle case where si might be the only parameter
    songLink = songLink.replace(/[?&]si=[^&]*$/i, '');

    // Extract YouTube video ID
    const match = songLink.match(/(?:v=|youtu\.be\/|\/embed\/|\/v\/|watch\?v=)([a-zA-Z0-9_-]{11})/);
    if (!match) {
        alert(t.invalidLink);
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.delete("add_song");
        window.history.replaceState({}, "", newUrl);
        return;
    }
    const videoId = match[1];

    // Avoid duplicates
    if (playlist.some(s => s.videoId === videoId)) {
        alert(t.duplicateSong);
        console.log("Song already exists in playlist");

        // 🧹 Clear URL even if duplicate
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.delete("add_song");
        window.history.replaceState({}, "", newUrl);
        return;
    }

    let title = "Unknown Title";
    let author = "Unknown Artist";
    let albumArt = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

    // --- Try YouTube Data API (direct call, no proxy) ---
    if (typeof apiKey !== "undefined" && apiKey && apiKey !== "YOUR_YOUTUBE_API_KEY") {
        try {
            const apiUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${apiKey}`;
            console.log("Fetching video info directly from YouTube API:", apiUrl);
            
            // Directly call the YouTube API
            const res = await fetch(apiUrl);
            if (res.ok) {
                const data = await res.json();
                if (data.items && data.items.length > 0) {
                    const snippet = data.items[0].snippet;
                    title = snippet.title || title;
                    author = snippet.channelTitle || author;
                    albumArt = snippet.thumbnails?.high?.url || albumArt;
                    console.log("YouTube API success:", title, "by", author);
                }
            } else {
                console.warn("YouTube API failed:", res.status, res.statusText);
                // If a CORS error is encountered, try the oEmbed method.
                if (res.status === 0 || res.statusText === "") {
                    console.warn("There may be CORS restrictions, so the oEmbed method will be used.");
                }
            }
        } catch (err) {
            console.warn("YouTube API fetch failed:", err);
        }
    }

    // --- Fallback: YouTube oEmbed (if YouTube API fails) ---
    if (title === "Unknown Title" || author === "Unknown Artist") {
        try {
            const oEmbedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
            console.log("Trying oEmbed fallback:", oEmbedUrl);
            
            const res = await fetch(oEmbedUrl);
            if (res.ok) {
                const meta = await res.json();
                title = meta.title || title;
                author = meta.author_name || author;
                console.log("oEmbed success:", title, "by", author);
            } else {
                console.warn("oEmbed failed:", res.status, res.statusText);
            }
        } catch (err) {
            console.warn("oEmbed fetch failed:", err);
        }
    }

    // --- Final alternative: Use noembed.com (completely free, no API key required) ---
    if (title === "Unknown Title" || author === "Unknown Artist") {
        try {
            const noembedUrl = `https://noembed.com/embed?url=https://www.youtube.com/watch?v=${videoId}`;
            console.log("Trying noembed.com fallback:", noembedUrl);
            
            const res = await fetch(noembedUrl);
            if (res.ok) {
                const data = await res.json();
                title = data.title || title;
                author = data.author_name || author;
                console.log("noembed.com success:", title, "by", author);
            }
        } catch (err) {
            console.warn("noembed.com fetch failed:", err);
        }
    }

    // Clean song name
    title = title
        .replace(/\s*-\s*Topic$/i, "")
        .replace(new RegExp(`^${author}\\s*-\\s*`, "i"), "")
        .trim();

    // Add to playlist
    const newSong = { videoId, songName: title, authorName: author, albumArt };
    playlist.push(newSong);
    savePlaylist();
    renderPlaylist(playlist);

    alert(t.addedSong(title, author));

    console.log(`✅ Added: ${title} — ${author}`);

    // 🧹 Immediately clear URL
    const newUrl = new URL(window.location.href);
    newUrl.searchParams.delete("add_song");
    window.history.replaceState({}, "", newUrl);
}

window.addEventListener("DOMContentLoaded", handleAddSongFromURL);

// Add these helper functions for caching after the searchYouTube function
function cacheSearchResults(term, results) {
    searchCache[term] = {
        results: results,
        timestamp: Date.now()
    };
    localStorage.setItem('ytSearchCache', JSON.stringify(searchCache));
}

function getCachedResults(term) {
    const cached = searchCache[term];
    // Return if cached and less than 1 hour old
    if (cached && (Date.now() - cached.timestamp < CACHE_EXPIRY)) {
        return cached.results;
    }
    return null;
}

function displaySearchResults(data) {
    const searchResultsList = document.getElementById('searchResultsList');
    const searchResultsContainer = document.getElementById('searchResults');
    const t = translations[currentLang];

    searchResultsContainer.classList.remove('d-none');

    if (data.items && data.items.length > 0) {
        data.items.forEach(item => {
            if (item.id.videoId) {
                const videoId = item.id.videoId;
                const title = item.snippet.title;
                const channelTitle = item.snippet.channelTitle;
                const thumbnailUrl = item.snippet.thumbnails.high.url;

                const resultItem = document.createElement('div');
                resultItem.classList.add('list-group-item', 'list-group-item-action', 'd-flex', 'align-items-center', 'mb-2', 'rounded');
                resultItem.innerHTML = `
                    <img src="${thumbnailUrl}" alt="${title}" class="me-3 rounded" style="width: 80px; height: 45px; object-fit: cover;">
                    <div class="flex-grow-1">
                        <h6 class="mb-1">${title}</h6>
                        <p class="mb-0 text-muted"><small>${channelTitle}</small></p>
                    </div>
                    <button class="btn btn-success btn-sm add-from-search-btn" 
                            data-video-id="${videoId}" 
                            data-song-title="${title.replace(/"/g, '&quot;')}" 
                            data-author-name="${channelTitle.replace(/"/g, '&quot;')}" 
                            data-album-art="${thumbnailUrl}">
                        ${ICON_PLUS} ${translations[currentLang].add}
                    </button>
                `;
                searchResultsList.appendChild(resultItem);
            }
        });
        
        document.querySelectorAll('.add-from-search-btn').forEach(button => {
            button.addEventListener('click', addSongFromSearch);
            button.setAttribute('title', t.addToPlaylist);
        });

        if (document.body.classList.contains('dark-mode')) {
            applyDarkModeToElements(true);
        }

    } else {
        searchResultsList.innerHTML = `<p class="text-center text-muted">${t.noResultsFound}</p>`;
    }
}

// Add cache clearing functionality
function clearExpiredCache() {
    let hasChanges = false;
    const now = Date.now();
    
    for (const term in searchCache) {
        if (now - searchCache[term].timestamp > CACHE_EXPIRY) {
            delete searchCache[term];
            hasChanges = true;
        }
    }
    
    if (hasChanges) {
        localStorage.setItem('ytSearchCache', JSON.stringify(searchCache));
    }
}

// Call this on startup
clearExpiredCache();

function addSongFromSearch(event) {
    const button = event.currentTarget;
    const videoId = button.getAttribute('data-video-id');
    const songTitle = button.getAttribute('data-song-title');
    const authorName = button.getAttribute('data-author-name');
    const albumArt = button.getAttribute('data-album-art');

    // Check if song already exists
    const songExists = playlist.some(song => song.videoId === videoId);
    if (songExists) {
        alert(translations[currentLang].songAlreadyExists);
        return;
    }

    const newSong = { videoId, songName: songTitle, authorName, albumArt };
    playlist.push(newSong);
    savePlaylist();
    renderPlaylist(playlist);
    alert(`${songTitle} by ${authorName}${translations[currentLang].songAdded}`);

    // ✅ If playlist was empty before, autoplay the new song
    if (playlist.length === 1) {
        loadNewVideo(videoId, albumArt, newSong);
    }

    // Optional: Hide search results or clear search input after adding
    // document.getElementById('youtubeSearchInput').value = '';
    // document.getElementById('searchResults').classList.add('d-none');
}

// Set default song name and author to the first song
let lastSong = '';
let lastAuthor = '';

let currentVolume = parseInt(localStorage.getItem("volumeLevel")) || 80;

// Make onYouTubeIframeAPIReady globally accessible
window.onYouTubeIframeAPIReady = function() {
    console.log("YouTube IFrame API is ready!");
    if (playlist.length > 0) {
        selectedVideoId = playlist[0].videoId;
    } else {
        selectedVideoId = '';
    }

    player = new YT.Player('player', {
        videoId: selectedVideoId,
        playerVars: {
            autoplay: 0,
            controls: 0,
            modestbranding: 1,
            showinfo: 0,
            rel: 0,
            fs: 0,
            iv_load_policy: 3,
            start: 0
        },
        events: {
            'onReady': (event) => {
                // Set volume to 80% to prevent loud start
                event.target.setVolume(currentVolume);
                updateVolumeUI(currentVolume);
            },
            'onStateChange': handlePlayerStateChange, 
            'onError': handleVideoError
        }
    });
};

function handleVideoError(event) {
    let errorMsg = document.getElementById("errorMessage");
    let countdown = 5;

    clearInterval(countdownInterval);
    errorMsg.style.transition = "opacity 0.5s ease-in-out";
    errorMsg.style.opacity = "0";
    errorMsg.style.display = "block";
    setTimeout(() => { errorMsg.style.opacity = "1"; }, 500);
    playing = false;
    songUnavailable = true;

    if (player && player.pauseVideo) {
        player.pauseVideo();
    }

    playPauseBtn.innerHTML = ICON_PLAY; // Use constant
    document.getElementById("albumArt").classList.add("rotate-paused");
    clearTimeout(errorTimeout);

    function updateCountdown() {
        const t = translations[currentLang];
        errorMsg.innerHTML = `⚠ ${t.songUnavailable} ${countdown} ${t.seconds} ...`;
        countdown--;
        if (countdown < 0) {
            clearInterval(countdownInterval);
            errorMsg.style.transition = "opacity 0.5s ease-in-out";
            errorMsg.style.opacity = "0";
            setTimeout(() => {
                errorMsg.style.display = "none";
                if (document.getElementById("autoPlayToggle").classList.contains("active")) {
                    playNextSong();
                }
            }, 500);
        }
    }

    countdownInterval = setInterval(updateCountdown, 1000);
    updateCountdown();
}

// ✅ Reset countdown if user switches songs
function resetErrorState() {
    clearInterval(countdownInterval); // Stop the countdown
    let errorMsg = document.getElementById("errorMessage");
    if (errorMsg) {
        errorMsg.style.display = "none"; // Hide error message
        errorMsg.innerHTML = ""; // Clear message content
        }
}

function removeArtistFromTitle(title, artist) {
  if (!title) return title;

  let cleanedTitle = title.trim();

  // ✅ Rule 1: Exact author at start → remove author + optional dash
  if (artist) {
    const pattern = new RegExp(`^${artist}\\s*-?\\s*`, "i");
    cleanedTitle = cleanedTitle.replace(pattern, "").trim();
  }

  // ✅ Rule 2: If still contains dash → remove everything before first dash
  if (cleanedTitle.includes("-")) {
    cleanedTitle = cleanedTitle.split("-").slice(1).join("-").trim();
  }

  return cleanedTitle;
}

// Attach reset function to song change event
document.getElementById("songList").addEventListener("click", resetErrorState); // Example event listener

function loadNewVideo(videoId, albumArtUrl, songObject = null) {
    if (player) {
        // If player exists, set volume to current value
        player.setVolume(currentVolume);
    }
    
    let albumArt = document.getElementById("albumArt");
    albumArt.style.transition = "opacity 0.5s ease-in-out";
    albumArt.style.opacity = "0";
    
    // Only fade album art if we're in spin or none mode
    if (albumArtDisplayMode !== "video") {
        setTimeout(() => {
            albumArt.classList.remove("rotate");
            albumArt.style.transform = "rotate(0deg)";
            
            if (albumArtUrl && isValidImageUrl(albumArtUrl)) {
                albumArt.setAttribute("src", albumArtUrl);
            } else {
                console.error("Invalid or unsafe albumArtUrl:", albumArtUrl);
                albumArt.setAttribute("src", "https://via.placeholder.com/300");
            }
            
            albumArt.onload = () => {
                setTimeout(() => {
                    albumArt.style.opacity = "1";
                    if (playing && albumArtDisplayMode === "spin") {
                        albumArt.classList.remove("rotate-paused");
                        albumArt.classList.add("rotate");
                    } else {
                        albumArt.classList.remove("rotate", "rotate-paused");
                    }
                }, 500);
            };
        }, 500);
    } else {
        // In video mode, ensure video player is initialized
        setTimeout(() => {
            initializeVideoPlayerInAlbumArt(videoId);
        }, 100);
        albumArt.style.opacity = "1";
    }

    updateBackgroundImage(albumArtUrl);

    let songTitleElem = document.querySelector("#nowPlaying .song-title");
    let authorNameElem = document.querySelector("#nowPlaying .author-name");

    if (songObject) {
        let songName = songObject.songName;
        let authorName = songObject.authorName;

        if (songName !== lastSong) {  // Only animate if song name changes
            songTitleElem.style.transition = "opacity 0.5s ease-in-out";
            songTitleElem.style.opacity = "0";
            setTimeout(() => {
                const displayTitle = removeArtistFromTitle(songName, authorName);
                songTitleElem.innerText = displayTitle;
                songTitleElem.style.opacity = "1";
            }, 500);
            lastSong = songName;
        }
        
        if (authorName !== lastAuthor) { // Only animate if author name changes
            authorNameElem.style.transition = "opacity 0.5s ease-in-out";
            authorNameElem.style.opacity = "0";
            setTimeout(() => {
                authorNameElem.innerText = authorName;
                authorNameElem.style.opacity = "1";
            }, 500);
            lastAuthor = authorName;
        }

        loadLyricsFor(songObject.songName, songObject.authorName);
    }

    clearTimeout(errorTimeout);
    document.getElementById("errorMessage").style.display = "none";
    songUnavailable = false;

    // ✅ Reset countdown interval if switching songs
    clearInterval(countdownInterval);

    // ✅ Load and play the new video
    if (typeof player === "undefined" || !player.loadVideoById) {
        document.getElementById("playerContainer").innerHTML = `<div id="player"></div>`;
        // Ensure the API is ready before creating a player
        if (window.YT && window.YT.Player) {
            player = new YT.Player('player', {
                videoId: videoId,
                playerVars: {
                    autoplay: 1,
                    controls: 0,
                    modestbranding: 1,
                    showinfo: 0,
                    rel: 0
                },
                events: {
                    'onReady': (event) => {
                        event.target.setVolume(currentVolume);
                        updateVolumeUI(currentVolume);
                        document.getElementById("volumeControl").value = currentVolume;
                        event.target.playVideo();
                        
                        // Setup media session after player is ready
                        setupMediaSession();
                        
                        // Initialize video player in album art position if in video mode
                        if (albumArtDisplayMode === "video") {
                            initializeVideoPlayerInAlbumArt(videoId);
                        }
                    },
                    'onStateChange': handlePlayerStateChange, 
                    'onError': handleVideoError
                }
            });
        } else {
            console.error("YouTube IFrame API not ready when trying to load new video.");
            // Fallback or retry logic can be added here
        }
    } else {
        player.loadVideoById(videoId);
        player.setVolume(currentVolume);
        player.playVideo();
        
        // Setup media session
        setupMediaSession();
        
        // Initialize video player in album art position if in video mode
        if (albumArtDisplayMode === "video") {
            initializeVideoPlayerInAlbumArt(videoId);
        }
    }

    // Update selectedVideoId
    selectedVideoId = videoId;

    // ✅ Update media session metadata
    if ('mediaSession' in navigator && songObject) {
        navigator.mediaSession.metadata = new MediaMetadata({
            title: songObject.songName,
            artist: songObject.authorName,
            artwork: [
                { src: songObject.albumArt, sizes: '300x300', type: 'image/jpeg' }
            ]
        });
    }

    // ✅ Reset progress bar and timer
    document.getElementById("progress").style.width = "0%";
    document.getElementById("currentTime").innerText = "0:00";
    document.getElementById("totalTime").innerText = "0:00";

    playing = true;
    document.getElementById("playPauseBtn").innerHTML = ICON_PAUSE;

    // ✅ Start tracking progress
    updateProgressBar();
}

// Add this function to update video player when mode changes
function updateVideoPlayerOnModeChange() {
    const currentVideoId = player ? player.getVideoData().video_id : selectedVideoId;
    
    if (albumArtDisplayMode === "video" && currentVideoId) {
        // Delay slightly to ensure DOM is updated
        setTimeout(() => {
            initializeVideoPlayerInAlbumArt(currentVideoId);
        }, 50);
    }
}

function updateBackgroundImage(imageUrl) {
    let background = document.getElementById("background");
    
    // Fade out the background
    background.style.transition = "opacity 0.5s ease-in-out";
    background.style.opacity = "0";

    setTimeout(() => {
        // Change background image
        background.style.backgroundImage = `url(${imageUrl})`;
        
        // Wait for image load before fading in
        let img = new Image();
        img.src = imageUrl;
        img.onload = () => {
            background.style.opacity = "1"; // Fade in
        };
    }, 500); // Match fade-out duration
}

function isValidImageUrl(url) {
    try {
        let parsed = new URL(url);

        // ✅ Allow only HTTP(S) URLs
        if (!["http:", "https:"].includes(parsed.protocol)) {
            console.error("Blocked non-HTTP(S) URL:", url);
            return false;
        }

        // ✅ Ensure the URL points to an actual image file
        if (!/\.(jpg|jpeg|png|gif|webp)$/i.test(parsed.pathname)) {
            console.error("Blocked non-image URL:", url);
            return false;
        }

        return true;
    } catch (e) {
        console.error("Invalid URL format:", url);
        return false;
    }
}

function getAbsoluteUrl(url) {
    if (url.startsWith("http://") || url.startsWith("https://")) {
        return url; // Already absolute
    }
    return new URL(url, window.location.origin).href; // Convert relative to absolute
}

document.addEventListener("DOMContentLoaded", function () {
    document.body.style.opacity = "1";

    loadPlaylist(); // Load and render playlist on startup

    let firstSong = document.querySelector('#songList li.selected');

    if (firstSong) {
        let firstImage = firstSong.getAttribute("data-img");
        let firstSongName = firstSong.querySelector(".song").innerText;
        let firstAuthorName = firstSong.querySelector(".author").innerText;

        if (firstImage) {
            let absoluteImageUrl = getAbsoluteUrl(firstImage);
            
            let albumArt = document.getElementById("albumArt");
            let background = document.getElementById("background");

            if (albumArt && background) {
                if (isValidImageUrl(absoluteImageUrl)) {
                    albumArt.setAttribute("src", absoluteImageUrl);
                    background.style.backgroundImage = `url('${absoluteImageUrl}')`; // ✅ Secure assignment
                }
            } else {
                console.error("albumArt or background element not found!");
            }
        }

        document.querySelector("#nowPlaying .song-title").innerText = firstSongName;
        document.querySelector("#nowPlaying .author-name").innerText = firstAuthorName;
    }
    setupMediaSession();
});

document.addEventListener("DOMContentLoaded", function () {
    const volumeControl = document.getElementById("volumeControl");
    const volumeProgress = document.getElementById("volumeProgress");
    const volumeThumb = document.getElementById("volumeThumb");
    const volumeBarContainer = document.querySelector(".volume-bar-container");

    // Load saved volume or default to 80 (to prevent loud start)
    currentVolume = parseInt(localStorage.getItem("volumeLevel")) || 80;
    volumeControl.value = currentVolume;
    
    // Initialize UI
    updateVolumeUI(currentVolume);

    function updateVolumeUI(volumeValue) {
        if (!volumeBarContainer || !volumeThumb || !volumeProgress) return;
        
        const progressBarWidth = volumeBarContainer.offsetWidth;
        const thumbPosition = (volumeValue / 100) * progressBarWidth;
        
        // Update progress bar
        volumeProgress.style.width = `${volumeValue}%`;
        
        // Update thumb position
        volumeThumb.style.left = `${thumbPosition}px`;
    }

    // Input event for smooth sliding
    volumeControl.addEventListener("input", function () {
        let volumeValue = parseInt(this.value);
        currentVolume = volumeValue;
        localStorage.setItem("volumeLevel", volumeValue);

        if (player && player.setVolume) {
            player.setVolume(volumeValue);
        }
        
        updateVolumeUI(volumeValue);
    });

    // Click on volume bar to set volume
    volumeBarContainer.addEventListener("click", function (event) {
        if (event.target === volumeControl || event.target === volumeThumb) return;
        
        const rect = this.getBoundingClientRect();
        const clickX = event.clientX - rect.left;
        const percentage = Math.max(0, Math.min(100, Math.round((clickX / rect.width) * 100)));
        
        volumeControl.value = percentage;
        currentVolume = percentage;
        localStorage.setItem("volumeLevel", percentage);
        
        if (player && player.setVolume) {
            player.setVolume(percentage);
        }
        
        updateVolumeUI(percentage);
        
        // Trigger input event for consistency
        volumeControl.dispatchEvent(new Event('input'));
    });

    // Adjust position on window resize
    window.addEventListener("resize", () => {
        updateVolumeUI(currentVolume);
    });

    // Initialize on page load
    updateVolumeUI(currentVolume);
    
    // Fix for touch devices
    volumeControl.addEventListener("touchstart", function (e) {
        e.stopPropagation();
    }, { passive: false });
    
    volumeControl.addEventListener("touchmove", function (e) {
        e.preventDefault();
        e.stopPropagation();
    }, { passive: false });
});

document.addEventListener("DOMContentLoaded", function () {
    // Initialize album art display mode toggle
    const albumArtDisplayToggle = document.getElementById("albumArtDisplayToggle");
    if (albumArtDisplayToggle) {
        // Set the active button based on saved mode
        const activeButton = albumArtDisplayToggle.querySelector(`[data-mode="${albumArtDisplayMode}"]`);
        if (activeButton) {
            albumArtDisplayToggle.querySelectorAll('.btn').forEach(btn => {
                btn.classList.remove('active');
            });
            activeButton.classList.add('active');
        }
        
        // Add event listeners to toggle buttons
        albumArtDisplayToggle.querySelectorAll('.btn').forEach(button => {
            button.addEventListener('click', function() {
                const mode = this.getAttribute('data-mode');
                
                // Update active button
                albumArtDisplayToggle.querySelectorAll('.btn').forEach(btn => {
                    btn.classList.remove('active');
                });
                this.classList.add('active');
                
                // Update mode and apply
                albumArtDisplayMode = mode;
                applyAlbumArtDisplayMode();
                
                // Update video player if needed
                updateVideoPlayerOnModeChange();
            });
        });
        
        // Apply initial mode
        applyAlbumArtDisplayMode();
        
        // Initialize video player if in video mode
        if (albumArtDisplayMode === "video" && selectedVideoId) {
            setTimeout(() => {
                initializeVideoPlayerInAlbumArt(selectedVideoId);
            }, 500);
        }
    }
});

function applyAlbumArtDisplayMode() {
    const albumArt = document.getElementById("albumArt");
    const videoPlayerContainer = document.getElementById("videoPlayerInAlbumArt");
    //const playerContainer = document.getElementById("playerContainer");
    //const togglePlayerBtn = document.getElementById("togglePlayerBtn");
    const mainPlayerContainer = document.querySelector('.card-body.text-center');
    
    if (!albumArt || !videoPlayerContainer) return;
    
    // Get current video ID and album art
    const currentVideoId = player ? player.getVideoData().video_id : selectedVideoId;
    const currentSong = playlist.find(song => song.videoId === currentVideoId);
    const currentAlbumArtUrl = currentSong ? currentSong.albumArt : albumArt.src;
    
    // Remove all mode classes first
    document.body.classList.remove('album-art-spin-mode', 'album-art-none-mode', 'album-art-video-mode');
    
    // Apply the selected mode
    switch(albumArtDisplayMode) {
        case "spin":
            document.body.classList.add('album-art-spin-mode');
            albumArtSpinEnabled = true;
            
            // Show album art (already preloaded)
            albumArt.style.display = "block";
            videoPlayerContainer.style.display = "none";
            
            // Ensure album art has the correct src
            if (currentSong && albumArt.src !== currentAlbumArtUrl) {
                albumArt.src = currentAlbumArtUrl;
            }
            
            // Apply spin if playing
            if (playing) {
                albumArt.classList.remove("rotate-paused");
                albumArt.classList.add("rotate");
            } else {
                albumArt.classList.remove("rotate", "rotate-paused");
            }

            break;
            
        case "none":
            document.body.classList.add('album-art-none-mode');
            albumArtSpinEnabled = false;
            
            // Show album art (already preloaded)
            albumArt.style.display = "block";
            videoPlayerContainer.style.display = "none";
            
            // Ensure album art has the correct src
            if (currentSong && albumArt.src !== currentAlbumArtUrl) {
                albumArt.src = currentAlbumArtUrl;
            }
            
            albumArt.classList.remove("rotate", "rotate-paused");
            
            break;
            
        case "video":
            document.body.classList.add('album-art-video-mode');
            albumArtSpinEnabled = false;
            
            // Hide album art, show video player
            albumArt.style.display = "none";
            videoPlayerContainer.style.display = "block";
            albumArt.classList.remove("rotate", "rotate-paused");

            // Initialize video player in the album art position if needed
            initializeVideoPlayerInAlbumArt(currentVideoId);
            break;
    }
    
    // Save the setting
    localStorage.setItem("albumArtDisplayMode", albumArtDisplayMode);
    localStorage.setItem("albumArtSpin", JSON.stringify(albumArtSpinEnabled));
}

// New function to initialize video player in album art position
function initializeVideoPlayerInAlbumArt(videoId) {
    const videoContainer = document.getElementById("videoPlayerInAlbumArt");
    if (!videoContainer || !videoId) return;
    
    // Check if YouTube API is ready
    if (typeof YT !== 'undefined' && YT.Player) {
        // If player already exists in the video container, update it
        const existingPlayer = videoContainer.querySelector('#player');
        if (existingPlayer && existingPlayer.id && window[existingPlayer.id]) {
            // Player already exists, just update the video
            const videoPlayer = window[existingPlayer.id];
            if (videoPlayer.loadVideoById) {
                videoPlayer.loadVideoById(videoId);
                videoPlayer.setVolume(currentVolume);
            }
        } else {
            // Create new player in the album art position
            createVideoPlayerInAlbumArt(videoId);
        }
    } else {
        // Wait for YouTube API to load
        setTimeout(() => initializeVideoPlayerInAlbumArt(videoId), 100);
    }
}

// Function to create video player in album art position
function createVideoPlayerInAlbumArt(videoId) {
    const videoContainer = document.getElementById("videoPlayerInAlbumArt");
    if (!videoContainer) return;
    
    // Clear existing content
    videoContainer.innerHTML = '<div id="playerInAlbumArt"></div>';
    
    // Create new player
    const playerId = 'playerInAlbumArt';
    const videoPlayer = new YT.Player(playerId, {
        videoId: videoId,
        playerVars: {
            autoplay: playing ? 1 : 0,
            controls: 0,
            modestbranding: 1,
            showinfo: 0,
            rel: 0,
            playsinline: 1 // Important for mobile
        },
        events: {
            'onReady': function(event) {
                event.target.setVolume(currentVolume);
                event.target.playVideo();
            },
            'onStateChange': function(event) {
                // Handle video state changes if needed
                if (event.data === YT.PlayerState.PLAYING && albumArtDisplayMode === "video") {
                    // Video is playing in album art mode
                }
            }
        }
    });
    
    // Store reference to this player
    window[playerId] = videoPlayer;
}

window.onload = function () {
    let firstSong = document.querySelector('#songList li.selected');
    
    if (firstSong) {
        let albumArtUrl = firstSong.getAttribute("data-img");

        if (albumArtUrl) {
            let absoluteUrl = getAbsoluteUrl(albumArtUrl);

            if (isValidImageUrl(absoluteUrl)) {
                let albumArt = document.getElementById("albumArt");
                if (albumArt) {
                    albumArt.setAttribute("src", absoluteUrl);
                }
            }
        }
    } else {
        console.error("Error: No songs found in #songList.");
    }
};

function setupMediaSession() {
    if ('mediaSession' in navigator) {
        navigator.mediaSession.setActionHandler('play', function() {
            if (player && !playing) {
                player.playVideo();
                playing = true;
                document.getElementById('playPauseBtn').innerHTML = ICON_PAUSE;
                if (albumArtSpinEnabled) {
                    document.getElementById("albumArt").classList.remove("rotate-paused");
                    document.getElementById("albumArt").classList.add("rotate");
                }
            }
        });

        navigator.mediaSession.setActionHandler('pause', function() {
            if (player && playing) {
                player.pauseVideo();
                playing = false;
                document.getElementById('playPauseBtn').innerHTML = ICON_PLAY;
                if (albumArtSpinEnabled) {
                    document.getElementById("albumArt").classList.add("rotate-paused");
                }
            }
        });

        navigator.mediaSession.setActionHandler('previoustrack', function() {
            playPreviousSong();
        });

        navigator.mediaSession.setActionHandler('nexttrack', function() {
            playNextSong();
        });
    }
}

document.getElementById("playPauseBtn").addEventListener("click", function () {
    if (songUnavailable) return;
    
    let albumArt = document.getElementById("albumArt");
    
    if (player) {
        if (playing) {
            player.pauseVideo();
            this.innerHTML = ICON_PLAY;
            playing = false;
            clearInterval(progressInterval);
            
            // Handle album art spin in spin mode
            if (albumArtDisplayMode === "spin" && albumArtSpinEnabled) {
                albumArt.classList.add("rotate-paused");
            }
            
            // Update media session
            if ('mediaSession' in navigator) {
                navigator.mediaSession.playbackState = 'paused';
            }
        } else {
            player.playVideo();
            this.innerHTML = ICON_PAUSE;
            playing = true;
            updateProgressBar();
            
            // Handle album art spin in spin mode
            if (albumArtDisplayMode === "spin" && albumArtSpinEnabled) {
                albumArt.classList.remove("rotate-paused");
                albumArt.classList.add("rotate");
            }
            
            // Update media session
            if ('mediaSession' in navigator) {
                navigator.mediaSession.playbackState = 'playing';
            }
            
            // If bx-revision is showing, reset it to Play/Pause
            if (this.innerHTML.includes("bx-revision")) {
                this.innerHTML = ICON_PAUSE;
            }
        }
    }
});

document.getElementById("prevBtn").addEventListener("click", playPreviousSong);
document.getElementById("nextBtn").addEventListener("click", playNextSong);

function playPreviousSong() {
    let songItems = document.querySelectorAll("#songList li:not(.empty-playlist)");
    if (songItems.length === 0) return; // No songs to play

    let currentSongElement = document.querySelector("#songList li.selected");
    let currentIndex = Array.from(songItems).indexOf(currentSongElement);

    let prevIndex = (currentIndex - 1 + songItems.length) % songItems.length;

    let prevSongElement = songItems[prevIndex];
    if (currentSongElement) {
        currentSongElement.classList.remove("selected");
    }
    prevSongElement.classList.add("selected");

    let prevVideoId = prevSongElement.getAttribute("data-video");
    let prevAlbumArtUrl = prevSongElement.getAttribute("data-img");
    const prevSongObject = playlist.find(s => s.videoId === prevVideoId);

    actualSelectedVideoId = prevVideoId;

    loadNewVideo(prevVideoId, prevAlbumArtUrl, prevSongObject);
    scrollToSelectedSong();
}

function playNextSong() {
    let songItems = document.querySelectorAll("#songList li:not(.empty-playlist)");
    if (songItems.length === 0) return; // No songs to play

    let currentSongElement = document.querySelector("#songList li.selected");
    let currentIndex = Array.from(songItems).indexOf(currentSongElement);

    let nextIndex = (currentIndex + 1) % songItems.length;

    let nextSongElement = songItems[nextIndex];
    if (currentSongElement) {
        currentSongElement.classList.remove("selected");
    }
    nextSongElement.classList.add("selected");

    let nextVideoId = nextSongElement.getAttribute("data-video");
    let nextAlbumArtUrl = nextSongElement.getAttribute("data-img");
    const nextSongObject = playlist.find(s => s.videoId === nextVideoId);

    // ✅ Update the actual selected video ID
    actualSelectedVideoId = nextVideoId;

    loadNewVideo(nextVideoId, nextAlbumArtUrl, nextSongObject);
    scrollToSelectedSong();
}

function updateProgressBar() {
    clearInterval(progressInterval);
    progressInterval = setInterval(() => {
        if (player && player.getCurrentTime && !isDragging) {
            let currentTime = player.getCurrentTime();
            let duration = player.getDuration();

            if (duration > 0) {
                let progressPercent = (currentTime / duration) * 100;
                document.getElementById("progress").style.width = progressPercent + "%";

                // ✅ Update time display correctly
                document.getElementById("currentTime").innerText = formatTime(currentTime);
                document.getElementById("totalTime").innerText = formatTime(duration);
            }

            // ✅ If video ends, handle accordingly
            if (player.getPlayerState() === 0) { // 0 = ENDED
                clearInterval(progressInterval);
                let playPauseBtn = document.getElementById("playPauseBtn");
                let autoPlayToggle = document.getElementById("autoPlayToggle").checked;

                if (repeatSong) {
                    player.seekTo(0); // Restart the current song
                    player.playVideo(); // Always play again when Repeat is ON
                } else if (autoPlay) {
                    const autoPlay = document.getElementById("autoPlayToggle").classList.contains("active");
                } else {
                    // Show bx-revision when the song ends and Auto-Play is OFF
                    playPauseBtn.innerHTML = ICON_REVISION; // Use constant
                    playing = false;
                }
            }
        }
    }, 1000);
}

function formatTime(seconds) {
    let mins = Math.floor(seconds / 60);
    let secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
}

const progressBar = document.getElementById("progressBar");
const progress = document.getElementById("progress");

progressBar.addEventListener("mousedown", function(event) {
    if (songUnavailable) return;
    isDragging = true;
    wasPlaying = playing; // Store whether video was playing before dragging
    seek(event);
});

progressBar.addEventListener("touchstart", function(event) {
    if (songUnavailable) return;
    isDragging = true;
    wasPlaying = playing; // Store playing state
    seek(event.touches[0]);
    event.preventDefault(); // Prevent page scrolling
});

document.addEventListener("mousemove", function(event) {
    if (isDragging) {
        seek(event);
    }
});

document.addEventListener("touchmove", function(event) {
    if (isDragging) {
        seek(event.touches[0]);
        event.preventDefault(); // Prevent page scrolling
    }
});

document.addEventListener("mouseup", function() {
    if (isDragging) {
        isDragging = false;
        if (!wasPlaying) {
            player.pauseVideo(); // Keep video paused if it was paused before seeking
        }
    }
});

document.addEventListener("touchend", function() {
    if (isDragging) {
        isDragging = false;
        if (!wasPlaying) {
            player.pauseVideo();
        }
    }
});

function seek(event) {
    let barWidth = progressBar.offsetWidth;
    let clientX = event.clientX || event.touches[0].clientX; // Handle both mouse and touch events
    let clickPosition = clientX - progressBar.getBoundingClientRect().left;
    let duration = player.getDuration();
    let seekTime = (clickPosition / barWidth) * duration;

    if (player && duration > 0) {
        player.seekTo(seekTime, true);

        if (!wasPlaying) {
            player.pauseVideo(); // Prevent auto-play if the user was just seeking
        }

        let progressPercent = (seekTime / duration) * 100;
        progress.style.width = progressPercent + "%";
    }
}

// Make onYouTubeIframeAPIReady globally accessible and load the API
let tag = document.createElement('script');
tag.src = "https://www.youtube.com/iframe_api";
let firstScriptTag = document.getElementsByTagName('script')[0];
firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

let volumeBar = document.getElementById("volumeControl");
let volumeProgress = document.getElementById("volumeProgress");
let volumeThumb = document.getElementById("volumeThumb");
let isAdjustingVolume = false;

function updateVolumeUI(volumeValue) {
    const volumeProgress = document.getElementById("volumeProgress");
    const volumeThumb = document.getElementById("volumeThumb");
    const volumeBarContainer = document.querySelector(".volume-bar-container");

    if (!volumeProgress || !volumeThumb || !volumeBarContainer) return; // Ensure elements exist

    const progressBarWidth = volumeBarContainer.offsetWidth;
    const thumbWidth = volumeThumb.offsetWidth;
    const thumbPosition = (volumeValue / 100) * (progressBarWidth - thumbWidth) + (thumbWidth / 2);

    volumeProgress.style.width = `${volumeValue}%`;
    volumeThumb.style.left = `${thumbPosition}px`;
}

// Handle touch start
volumeBar.addEventListener("touchstart", function (event) {
    isAdjustingVolume = true;
    adjustVolume(event.touches[0]);
    event.preventDefault(); // Prevent default scrolling
});

// Handle touch move
volumeBar.addEventListener("touchmove", function (event) {
    if (isAdjustingVolume) {
        adjustVolume(event.touches[0]);
        event.preventDefault();
    }
});

// Handle touch end
volumeBar.addEventListener("touchend", function () {
    isAdjustingVolume = false;
});

function adjustVolume(event) {
    let bar = document.querySelector(".volume-bar-container");
    let barWidth = bar.offsetWidth;
    let clientX = event.clientX || event.touches[0].clientX; // Handle both mouse and touch events
    let touchX = clientX - bar.getBoundingClientRect().left;
    let newVolume = Math.max(0, Math.min(100, (touchX / barWidth) * 100));

    volumeBar.value = newVolume;
    currentVolume = newVolume;
    localStorage.setItem("volumeLevel", newVolume);

    if (player) {
        player.setVolume(newVolume);
    }
    updateVolumeUI(newVolume);
}

// Allow volume control using scroll
document.getElementById("volumeControl").addEventListener("wheel", function (event) {
    event.preventDefault(); // Prevent page scrolling

    let step = event.deltaY < 0 ? 5 : -5; // Scroll up increases, scroll down decreases
    let newValue = Math.min(100, Math.max(0, parseInt(this.value, 10) + step)); // Keep within range

    this.value = newValue;
    currentVolume = newValue;
    localStorage.setItem("volumeLevel", newValue);

    if (player) {
        player.setVolume(newValue);
    }

    updateVolumeUI(newValue); // Ensure UI updates properly
});

let repeatSong = false; // Track repeat mode

document.getElementById("repeatBtn").addEventListener("click", function () {
    repeatSong = !repeatSong;
    this.classList.toggle("active", repeatSong); // Toggle active class
});

function handlePlayerStateChange(event) {
    let albumArt = document.getElementById("albumArt");
    let playPauseBtn = document.getElementById("playPauseBtn");
    let autoPlay = document.getElementById("autoPlayToggle").classList.contains("active");

    // Apply album art spin based on current mode
    if (albumArtDisplayMode === "spin") {
        if (event.data === 1) { // PLAYING
            if (albumArtSpinEnabled) {
                albumArt.classList.remove("rotate-paused");
                albumArt.classList.add("rotate");
            }
        } else if (event.data === 2) { // PAUSED
            if (albumArtSpinEnabled) {
                albumArt.classList.add("rotate-paused");
            }
        } else if (event.data === 0) { // ENDED
            if (albumArtSpinEnabled) {
                albumArt.classList.add("rotate-paused");
            }
        }
    }

    if (event.data === 0) { // ✅ 0 means video ended
        playing = false;
        if (albumArtSpinEnabled) {
            albumArt.classList.add("rotate-paused");
        }

        if (repeatSong) {
            player.seekTo(0); // ✅ Restart the current song
            player.playVideo(); // ✅ Always play again when Repeat is ON
        } else if (autoPlay) {
            playNextSong(); // ✅ Play next song if Auto-Play is ON
        } else {
            // ✅ Show bx-revision when the song ends and Auto-Play is OFF
            playPauseBtn.innerHTML = ICON_REVISION; // Use constant
        }
        
        // Update media session
        if ('mediaSession' in navigator) {
            navigator.mediaSession.playbackState = 'none';
        }
    } else if (event.data === 2) { // ✅ 2 means PAUSED
        playPauseBtn.innerHTML = ICON_PLAY; // Use constant
        playing = false;
        if (albumArtSpinEnabled) {
            albumArt.classList.add("rotate-paused");
        }
        
        // Update media session
        if ('mediaSession' in navigator) {
            navigator.mediaSession.playbackState = 'paused';
        }
    } else if (event.data === 1) { // ✅ 1 means PLAYING
        playPauseBtn.innerHTML = ICON_PAUSE; // Use constant
        playing = true;
        if (albumArtSpinEnabled) {
            albumArt.classList.remove("rotate-paused");
            albumArt.classList.add("rotate");
        } else {
            albumArt.classList.remove("rotate-paused");
        }
        
        // Update media session
        if ('mediaSession' in navigator) {
            navigator.mediaSession.playbackState = 'playing';
            
            // Update metadata for Chrome media player
            const currentSong = playlist.find(song => song.videoId === selectedVideoId);
            if (currentSong) {
                navigator.mediaSession.metadata = new MediaMetadata({
                    title: currentSong.songName,
                    artist: currentSong.authorName,
                    artwork: [
                        { src: currentSong.albumArt, sizes: '300x300', type: 'image/jpeg' }
                    ]
                });
            }
        }
    }
    
    // Call setupMediaSession when player state changes
    setupMediaSession();
}

// Initialize auto-play button
document.addEventListener("DOMContentLoaded", function() {
    const autoPlayToggle = document.getElementById("autoPlayToggle");
    
    // Load saved auto-play state
    const savedAutoPlay = localStorage.getItem("autoPlay") !== "false"; // Default to true
    if (savedAutoPlay) {
        autoPlayToggle.classList.add("active");
    }
    
    // Toggle auto-play on click
    autoPlayToggle.addEventListener("click", function() {
        const isActive = this.classList.toggle("active");
        localStorage.setItem("autoPlay", isActive);
        
        // Visual feedback
        if (isActive) {
            this.innerHTML = '<i class="bx bx-play-circle"></i>';
        } else {
            this.innerHTML = '<i class="bx bx-stop-circle"></i>';
        }
    });
    
    // Set initial icon
    if (autoPlayToggle.classList.contains("active")) {
        autoPlayToggle.innerHTML = '<i class="bx bx-play-circle"></i>';
    } else {
        autoPlayToggle.innerHTML = '<i class="bx bx-stop-circle"></i>';
    }
});

document.addEventListener("DOMContentLoaded", function () {
    // Check if dark mode is enabled in local storage before page renders
    const isDarkMode = localStorage.getItem("darkMode") === "enabled";
    const darkModeToggle = document.getElementById("darkModeToggle");
    
    if (isDarkMode) {
        document.body.classList.add("dark-mode");
        if (darkModeToggle) darkModeToggle.checked = true;
        applyDarkModeToElements(true);
    } else {
        if (darkModeToggle) darkModeToggle.checked = false;
    }

    // Ensure body opacity animation starts only after dark mode is set
    document.body.style.opacity = "1";
});

document.getElementById("darkModeToggle").addEventListener("change", function () {
    if (darkModeToggleInProgress) {
        // Revert the checkbox if toggle is in progress
        this.checked = !this.checked;
        return;
    }
    
    darkModeToggleInProgress = true;

    requestAnimationFrame(() => {
        const isDarkMode = document.body.classList.toggle("dark-mode");
        
        // Update the checkbox state to match the actual dark mode state
        this.checked = isDarkMode;

        // Save the preference in local storage
        localStorage.setItem("darkMode", isDarkMode ? "enabled" : "disabled");

        // Toggle dark mode for relevant elements
        applyDarkModeToElements(isDarkMode);

        // Smooth transition for song title and author name
        document.querySelectorAll("#nowPlaying .song-title, #nowPlaying .author-name")
            .forEach(elem => {
                elem.style.transition = "opacity 0.5s ease-in-out, color 0.8s ease-in-out";
                elem.style.opacity = "0";
                setTimeout(() => {
                    elem.style.opacity = "1";
                }, 50);
            });

        // Prevent rapid toggling
        setTimeout(() => {
            darkModeToggleInProgress = false;
        }, 600);
    });
});

function applyDarkModeToElements(enable) {
    document.querySelectorAll(
        ".card, .btn-dark-mode-toggle, .author-name, .song-title, box-icon, #songList, #songList .list-group-item, #songList .list-group-item-action, #songList .song, #songList .author, #searchResultsList .list-group-item, #searchResultsList h6, #searchResultsList p, .cache-manager-window, .cache-manager-body, .cache-manager-content, .cache-list-container, .cache-list-header, .cache-list, .cache-item, .cache-item-details-modal, .cache-item-details-body, .cache-stats"
    ).forEach(el => el.classList.toggle("dark-mode", enable));
    
    // Update cache manager checkboxes visibility if needed
    if (typeof loadCacheList === 'function') {
        // Refresh cache list if it's open to apply dark mode styles
        const cacheManagerWindow = document.getElementById('cacheManagerWindow');
        if (cacheManagerWindow && cacheManagerWindow.classList.contains('show')) {
            loadCacheList();
        }
    }
    
    // Explicitly change text color for smooth transition
    document.querySelectorAll("#nowPlaying .song-title, #nowPlaying .author-name, #songList .author, #searchResultsList h6, #searchResultsList p, .cache-key, .stat-label, .stat-value")
        .forEach(elem => {
            elem.style.transition = "color 0.8s ease-in-out";
            elem.style.color = enable ? "white" : "black";
        });
    
    const darkModeToggle = document.getElementById("darkModeToggle");
    if (darkModeToggle) {
        darkModeToggle.checked = enable;
    }
}

// Prevent text selection
document.addEventListener("selectstart", function(event) {
    event.preventDefault();
});

// Prevent dragging of elements
document.addEventListener("dragstart", function(event) {
    event.preventDefault();
});

// Floating settings button functionality
document.addEventListener("DOMContentLoaded", function() {
    const settingsBtn = document.getElementById("settingsBtn");
    const settingsMenu = document.getElementById("settingsMenu");
    const floatingSettings = document.querySelector(".floating-settings");
    const settingsExportBtn = document.getElementById("settingsExportBtn");
    const settingsImportBtn = document.getElementById("settingsImportBtn");
    const settingsCloseBtn = document.querySelector(".settings-close-btn");
    const importFileInput = document.getElementById("importFileInput");
    
    // Toggle settings menu with animation
    settingsBtn.addEventListener("click", function(e) {
        e.stopPropagation();
        const isOpening = !settingsMenu.classList.contains("show");
        
        if (isOpening) {
            floatingSettings.classList.add("active");
            settingsMenu.classList.add("show");
        } else {
            closeSettingsMenu();
        }
    });
    
    // Close menu when close button is clicked
    settingsCloseBtn.addEventListener("click", function(e) {
        e.stopPropagation();
        closeSettingsMenu();
    });
    
    // Export playlist functionality
    settingsExportBtn.addEventListener("click", function() {
        exportPlaylist();
        closeSettingsMenu();
    });
    
    // Import playlist functionality
    settingsImportBtn.addEventListener("click", function() {
        importFileInput.click();
        closeSettingsMenu();
    });
    
    // Handle file selection for import
    importFileInput.addEventListener('change', function(e) {
        if (e.target.files && e.target.files.length > 0) {
            const file = e.target.files[0];
            
            if (file.type === 'application/json' || 
                file.type === 'text/plain' || 
                file.name.endsWith('.json') || 
                file.name.endsWith('.txt')) {
                importPlaylist(file);
            } else {
                alert(translations[currentLang].importFileTypeError);
            }
            this.value = '';
        }
    });
    
    // Close menu when clicking outside
    document.addEventListener("click", function(event) {
        if (!event.target.closest(".floating-settings") && settingsMenu.classList.contains("show")) {
            closeSettingsMenu();
        }
    });
    
    // Also close with Escape key
    document.addEventListener("keydown", function(event) {
        if (event.key === "Escape" && settingsMenu.classList.contains("show")) {
            closeSettingsMenu();
        }
    });
    
    // Function to close settings menu with smooth animation
    function closeSettingsMenu() {
        settingsMenu.classList.remove("show");
        // Remove active class after a short delay to allow the close animation
        setTimeout(() => {
            floatingSettings.classList.remove("active");
        }, 300); // Match the duration of the settings menu close animation
    }
});

// ---------- Lyrics Panel Toggle ----------
const lyricsPanel = document.getElementById("lyricsPanel");
const lyricsToggle = document.getElementById("lyricsToggle");

// Export playlist function
function exportPlaylist() {
    try {
        // Get current playlist and dark mode status
        const exportData = {
            playlist: playlist,
            albumArtDisplayMode: albumArtDisplayMode,
            darkMode: localStorage.getItem("darkMode") === "enabled",
            showLyrics: localStorage.getItem("showLyrics") === "true",
            language: currentLang,
            translationEnabled: translationEnabled,
            showOriginalFirst: showOriginalFirst,
            exportDate: new Date().toISOString(),
            version: "1.5"
        };
        
        const playlistData = JSON.stringify(exportData, null, 2);
        
        // Always export as TXT
        const fileExtension = 'txt';
        const mimeType = 'text/plain';
        
        const blob = new Blob([playlistData], { type: mimeType });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        const date = new Date().toISOString().slice(0, 10);
        a.href = url;
        a.download = `youtube-music-playlist-${date}.${fileExtension}`;
        a.style.display = 'none';
        
        document.body.appendChild(a);
        a.click();
        
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);

    } catch (error) {
        console.error("Error exporting playlist:", error);
        alert(translations[currentLang].exportError);
    }
}

// Import playlist function
function importPlaylist(file) {
    const reader = new FileReader();
    
    reader.onload = function(e) {
        try {
            const importedData = JSON.parse(e.target.result);
            
            // Handle both old format (array) and new format (object with playlist property)
            let importedPlaylist;
            let importDarkMode = false;
            let importLanguage = currentLang;
            let importTranslationEnabled = translationEnabled;
            let importShowOriginalFirst = showOriginalFirst;
            
            if (Array.isArray(importedData)) {
                // Old format - just the playlist array
                importedPlaylist = importedData;
            } else if (importedData.playlist && Array.isArray(importedData.playlist)) {
                // New format - object with playlist and settings properties
                importedPlaylist = importedData.playlist;
                importDarkMode = importedData.darkMode === true;
                importLanguage = importedData.language || currentLang;
                importTranslationEnabled = importedData.translationEnabled !== undefined ? importedData.translationEnabled : translationEnabled;
                importShowOriginalFirst = importedData.showOriginalFirst !== undefined ? importedData.showOriginalFirst : showOriginalFirst;
            } else {
                throw new Error("Invalid playlist format");
            }
            
            // Validate the imported playlist structure
            if (!validatePlaylist(importedPlaylist)) {
                throw new Error("Invalid playlist format: Missing required fields");
            }
            
            // Confirm replacement
            if (confirm(translations[currentLang].importConfirm.replace('${count}', importedPlaylist.length))) {
                // Replace current playlist
                playlist = importedPlaylist;
                savePlaylist();
                renderPlaylist(playlist);
                
                // Apply dark mode if included in export
                if (importDarkMode !== undefined) {
                    document.body.classList.toggle("dark-mode", importDarkMode);
                    localStorage.setItem("darkMode", importDarkMode ? "enabled" : "disabled");
                    applyDarkModeToElements(importDarkMode);
                }
                
                // Apply showLyrics setting if included in export
                if (importedData.showLyrics !== undefined) {
                    const showLyrics = importedData.showLyrics;
                    localStorage.setItem('showLyrics', showLyrics);
                    
                    // Update button states and show/hide lyrics container
                    const showSongListBtn = document.getElementById('showSongListBtn');
                    const showLyricsBtn = document.getElementById('showLyricsBtn');
                    const songListContainer = document.getElementById('songListContainer');
                    const lyricsContainer = document.getElementById('lyricsContainer');
                    const playlistSearchContainer = document.getElementById('playlistSearchContainer');
                    
                    if (showLyrics) {
                        // Show lyrics view
                        lyricsContainer.classList.remove('d-none');
                        songListContainer.classList.add('d-none');
                        playlistSearchContainer.classList.add('d-none');
                        
                        // Update button states
                        if (showLyricsBtn) {
                            showLyricsBtn.classList.add('active');
                            showLyricsBtn.classList.remove('btn-outline-primary');
                            showLyricsBtn.classList.add('btn-primary');
                        }
                        if (showSongListBtn) {
                            showSongListBtn.classList.remove('active');
                            showSongListBtn.classList.remove('btn-primary');
                            showSongListBtn.classList.add('btn-outline-primary');
                        }
                    } else {
                        // Show song list view
                        songListContainer.classList.remove('d-none');
                        playlistSearchContainer.classList.remove('d-none');
                        lyricsContainer.classList.add('d-none');
                        
                        // Update button states
                        if (showSongListBtn) {
                            showSongListBtn.classList.add('active');
                            showSongListBtn.classList.remove('btn-outline-primary');
                            showSongListBtn.classList.add('btn-primary');
                        }
                        if (showLyricsBtn) {
                            showLyricsBtn.classList.remove('active');
                            showLyricsBtn.classList.remove('btn-primary');
                            showLyricsBtn.classList.add('btn-outline-primary');
                        }
                    }
                }
                
                // Apply language settings if included in export
                if (importedData.language && translations[importedData.language]) {
                    currentLang = importedData.language;
                    localStorage.setItem("language", currentLang);
                    applyLanguage(currentLang);
                    
                    // Reload lyrics for current song to update metadata with new language
                    const currentTitle = document.querySelector("#nowPlaying .song-title")?.innerText;
                    const currentArtist = document.querySelector("#nowPlaying .author-name")?.innerText;
                    if (currentTitle && currentArtist) {
                        loadLyricsFor(currentTitle, currentArtist);
                    }
                }
                
                // Apply album art display mode if included in export
                if (importedData.albumArtDisplayMode) {
                    albumArtDisplayMode = importedData.albumArtDisplayMode;
                    localStorage.setItem("albumArtDisplayMode", albumArtDisplayMode);
                    
                    // Update toggle buttons
                    const albumArtDisplayToggle = document.getElementById("albumArtDisplayToggle");
                    if (albumArtDisplayToggle) {
                        albumArtDisplayToggle.querySelectorAll('.btn').forEach(btn => {
                            btn.classList.remove('active');
                            if (btn.getAttribute('data-mode') === albumArtDisplayMode) {
                                btn.classList.add('active');
                            }
                        });
                    }
                    applyAlbumArtDisplayMode();
                } else if (importedData.albumArtSpin !== undefined) {
                    // Backward compatibility with old exports
                    albumArtDisplayMode = importedData.albumArtSpin ? "spin" : "none";
                    localStorage.setItem("albumArtDisplayMode", albumArtDisplayMode);
                    applyAlbumArtDisplayMode();
                }
                
                // Apply translation settings if included in export
                if (importedData.translationEnabled !== undefined) {
                    translationEnabled = importedData.translationEnabled;
                    localStorage.setItem("translationEnabled", JSON.stringify(translationEnabled));
                    
                    // Update the translation toggle UI
                    const translationToggle = document.getElementById("translationToggle");
                    if (translationToggle) {
                        translationToggle.checked = translationEnabled;
                    }
                }
                
                // Apply translation order setting if included in export
                if (importedData.showOriginalFirst !== undefined) {
                    showOriginalFirst = importedData.showOriginalFirst;
                    localStorage.setItem("showOriginalFirst", JSON.stringify(showOriginalFirst));
                }
                
                // ✅ Reset playing state
                playing = false;
                if (player) {
                    player.stopVideo();
                    document.getElementById("playPauseBtn").innerHTML = ICON_PLAY;
                }
                clearInterval(progressInterval);

                // ✅ Select first song and load into player (no autoplay)
                if (playlist.length > 0) {
                    const firstSong = playlist[0];
                    const albumArtElem = document.getElementById("albumArt");
                    const background = document.getElementById("background");
                    const songTitleElem = document.querySelector("#nowPlaying .song-title");
                    const authorNameElem = document.querySelector("#nowPlaying .author-name");

                    // Update UI
                    albumArtElem.src = firstSong.albumArt;
                    background.style.backgroundImage = `url('${firstSong.albumArt}')`;
                    songTitleElem.innerText = firstSong.songName;
                    authorNameElem.innerText = firstSong.authorName;

                    // Highlight in playlist
                    document.querySelectorAll("#songList li").forEach(li => li.classList.remove("selected"));
                    const firstLi = document.querySelector("#songList li");
                    if (firstLi) firstLi.classList.add("selected");

                    // ✅ Load video but don't autoplay
                    selectedVideoId = firstSong.videoId;
                    if (player && player.loadVideoById) {
                        player.cueVideoById(firstSong.videoId); // cue = load but don't play
                    } else {
                        // If player not ready, create with autoplay off
                        player = new YT.Player('player', {
                            videoId: firstSong.videoId,
                            playerVars: {
                                autoplay: 0,
                                controls: 0,
                                modestbranding: 1,
                                showinfo: 0,
                                rel: 0
                            },
                            events: {
                                'onReady': (event) => {
                                    event.target.setVolume(currentVolume);
                                    updateVolumeUI(currentVolume);
                                    document.getElementById("volumeControl").value = currentVolume;
                                },
                                'onStateChange': handlePlayerStateChange, 
                                'onError': handleVideoError
                            }
                        });
                    }

                    // Reset progress bar + time display
                    document.getElementById("progress").style.width = "0%";
                    document.getElementById("currentTime").innerText = "0:00";
                    document.getElementById("totalTime").innerText = "0:00";
                }
                
                // Show import success message with settings applied
                let message = translations[currentLang].importSuccess.replace('${count}', importedPlaylist.length);
                
                if (importDarkMode !== undefined) {
                    const darkModeStatus = importDarkMode ? translations[currentLang].enabled : translations[currentLang].disabled;
                    message += ' ' + translations[currentLang].darkModeStatus.replace('${status}', darkModeStatus);
                }
                
                if (importedData.albumArtSpin !== undefined || importedData.albumArtDisplayMode) {
                    const spinStatus = (importedData.albumArtDisplayMode === "spin") || (importedData.albumArtSpin === true) ? 
                                      translations[currentLang].enabled : translations[currentLang].disabled;
                    message += ' ' + translations[currentLang].albumArtSpinStatus.replace('${status}', spinStatus);
                }
                
                if (importedData.showLyrics !== undefined) {
                    const lyricsStatus = importedData.showLyrics ? translations[currentLang].enabled : translations[currentLang].disabled;
                    message += ' ' + translations[currentLang].lyricsPanelStatus.replace('${status}', lyricsStatus);
                }
                
                if (importedData.language) {
                    const langName = importedData.language === 'zh' ? translations[currentLang].chinese : translations[currentLang].english;
                    message += ' ' + translations[currentLang].languageSet.replace('${language}', langName);
                }
                
                if (importedData.translationEnabled !== undefined) {
                    const translationStatus = importedData.translationEnabled ? 
                                            translations[currentLang].enabled : translations[currentLang].disabled;
                    message += ' ' + translations[currentLang].translationStatus.replace('${status}', translationStatus);
                }
                
                alert(message);
            }
        } catch (error) {
            console.error("Error importing playlist:", error);
            alert(translations[currentLang].importError + error.message);
        }
    };
    
    reader.onerror = function() {
        alert(translations[currentLang].fileReadError);
    };
    
    reader.readAsText(file);
}

// Add these helper functions to validate playlist structure
function isValidPlaylistItem(item) {
    return item && 
           typeof item === 'object' &&
           typeof item.videoId === 'string' &&
           typeof item.songName === 'string' &&
           typeof item.authorName === 'string' &&
           (typeof item.albumArt === 'string' || item.albumArt === undefined);
}

function validatePlaylist(playlistData) {
    if (!Array.isArray(playlistData)) return false;
    
    return playlistData.every(isValidPlaylistItem);
}

// Scroll to Top functionality
function initScrollToTop() {
    const goTopBtn = document.getElementById('goTopBtn');
    const floatingTop = document.querySelector('.floating-top');
    const scrollThreshold = 300; // Show button after scrolling 300px
    
    if (!goTopBtn) return;
    
    // Scroll event listener
    window.addEventListener('scroll', function() {
        if (window.pageYOffset > scrollThreshold) {
            floatingTop.classList.add('visible');
        } else {
            floatingTop.classList.remove('visible');
        }
    });
    
    // Click event listener
    goTopBtn.addEventListener('click', function() {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    });
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    initScrollToTop();
});

/* ---------------- LYRICS SYSTEM ---------------- */
let lyricsData = null;
let autoSyncEnabled = true;
let lyricsAutoScroll = true;
let syncInterval = null;

function parseLrc(text) {
  const lines = [];
  const regex = /\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\](.*)/;
  text.split(/\r?\n/).forEach(line => {
    const match = line.match(regex);
    if (match) {
      const time = parseInt(match[1]) * 60 + parseInt(match[2]) + ((parseInt(match[3]) || 0) / 100);
      lines.push({ time, text: match[4].trim() });
    }
  });
  return lines;
}

function renderLrcLines(lines) {
  const el = document.getElementById("lyricsText");
  el.innerHTML = lines
    .map((l, i) => {
      const m = Math.floor(l.time / 60);
      const s = Math.floor(l.time % 60);
      const formattedTime = `${m}:${s < 10 ? "0" + s : s}`;
      return `
        <div class="lrc-line" data-index="${i}" data-time="${l.time}" data-formatted-time="${formattedTime}">
          <span class="lrc-time">[${formattedTime}]</span>
          <span class="lrc-text">${l.text}</span>
        </div>`;
    })
    .join("");
}

let lyricsState = {
  status: "idle", // idle | loading | synced | plain | error | notfound
  artist: "",
  title: ""
};

async function fetchLyrics(title, artist) {
  // ✅ Create a cache key from artist and title
  const cacheKey = `lyrics_${encodeURIComponent(artist)}_${encodeURIComponent(title)}`;
  
  // ✅ Check local storage first
  const cachedLyrics = localStorage.getItem(cacheKey);
  if (cachedLyrics) {
    console.log("Using cached lyrics for:", artist, "-", title);
    
    try {
      const json = JSON.parse(cachedLyrics);
      const lyrics = json.syncedLyrics || json.plainLyrics;
      
      if (lyrics) {
        const meta = document.getElementById("lyricsMeta");
        const textEl = document.getElementById("lyricsText");
        const t = translations[currentLang];
        
        lyricsState = { status: "cached", artist, title };
        
        const isLrc = /^\s*\[\d{1,2}:\d{2}/m.test(lyrics);
        if (isLrc) {
          const parsed = parseLrc(lyrics);
          lyricsData = { isLrc: true, lrcLines: parsed };
          renderLrcLines(parsed);
          meta.textContent = `${t.lyricsSyncedFound} ${artist} – ${title} ${t.cached}`;
          lyricsState.status = "synced";
        } else {
          lyricsData = { isLrc: false, plain: lyrics };
          const lines = lyrics.split(/\r?\n/).filter(l => l.trim().length > 0);
          textEl.innerHTML = lines.map(line => `<div class="plain-line">${line}</div>`).join("");
          meta.textContent = `${t.lyricsPlainFound} ${artist} – ${title} ${t.cached}`;
          lyricsState.status = "plain";
        }
        
        window.currentSongArtist = artist;
        window.currentSongTitle = title;
        return; // Exit early since we have cached lyrics
      }
    } catch (e) {
      console.warn("Failed to parse cached lyrics, fetching fresh...", e);
      // Continue to fetch fresh lyrics
    }
  }

  // ✅ FIXED: Properly encode the URL components
  const tryFetch = async (artistName, trackName) => {
    // Properly encode the parameters separately
    const encodedArtist = encodeURIComponent(artistName);
    const encodedTrack = encodeURIComponent(trackName);
    const url = `https://lrclib.net/api/get?artist_name=${encodedArtist}&track_name=${encodedTrack}`;
    console.log("Fetching fresh lyrics from API:", url);

    // Use the CORS proxy (same as YouTube API)
    const proxiedUrl = `${CORS_PROXY_URL}${encodeURIComponent(url)}`;
    console.log("Proxied URL:", proxiedUrl);

    try {
      const response = await fetch(proxiedUrl);
      
      if (!response.ok) {
        console.error("Lyrics API error:", response.status, response.statusText);
        throw new Error(`Lyrics API error: ${response.status}`);
      }
      
      const data = await response.json();
      
      // ✅ Cache the response in local storage
      if (data.syncedLyrics || data.plainLyrics) {
        localStorage.setItem(cacheKey, JSON.stringify(data));
        console.log("Lyrics cached for:", artistName, "-", trackName);
        
        // Set expiry timestamp (7 days from now)
        const expiryKey = `${cacheKey}_expiry`;
        const expiryTime = Date.now() + (7 * 24 * 60 * 60 * 1000); // 7 days
        localStorage.setItem(expiryKey, expiryTime.toString());
      }
      
      return data;
    } catch (error) {
      console.error("Failed to fetch lyrics:", error);
      throw error;
    }
  };

  const meta = document.getElementById("lyricsMeta");
  const textEl = document.getElementById("lyricsText");
  const t = translations[currentLang];

  lyricsState = { status: "loading", artist, title };
  meta.textContent = t.searching;
  textEl.textContent = t.searching;

  try {
    // ✅ Try full name first
    let json = await tryFetch(artist, title);

    // ✅ If no lyrics found, try CJK-only artist
    if (!json.syncedLyrics && !json.plainLyrics) {
      const cjkOnlyArtist = artist.replace(/[\u0020A-Za-z]+/g, "").trim();
      if (cjkOnlyArtist && cjkOnlyArtist !== artist) {
        console.log("Retrying with CJK only:", cjkOnlyArtist);
        json = await tryFetch(cjkOnlyArtist, title);
        if (json.syncedLyrics || json.plainLyrics) {
          artist = cjkOnlyArtist; // ✅ Update to working version
        }
      }
    }

    const lyrics = json.syncedLyrics || json.plainLyrics;
    if (!lyrics) {
      console.log("No lyrics found for:", artist, "-", title);
      
      // ✅ Cache the "no lyrics" result to avoid repeated API calls
      const noLyricsData = { noLyrics: true, timestamp: Date.now() };
      localStorage.setItem(cacheKey, JSON.stringify(noLyricsData));
      
      throw new Error("No lyrics");
    }

    const isLrc = /^\s*\[\d{1,2}:\d{2}/m.test(lyrics);
    if (isLrc) {
      const parsed = parseLrc(lyrics);
      lyricsData = { isLrc: true, lrcLines: parsed };
      renderLrcLines(parsed);
      meta.textContent = `${t.lyricsSyncedFound} ${artist} – ${title}`;
      lyricsState.status = "synced";
    } else {
      lyricsData = { isLrc: false, plain: lyrics };
      const lines = lyrics.split(/\r?\n/).filter(l => l.trim().length > 0);
      textEl.innerHTML = lines.map(line => `<div class="plain-line">${line}</div>`).join("");
      meta.textContent = `${t.lyricsPlainFound} ${artist} – ${title}`;
      lyricsState.status = "plain";
    }
  } catch (e) {
    console.error("Lyrics fetch error:", e);
    lyricsData = null;
    
    // Display appropriate error message
    if (e.message.includes("No lyrics")) {
      textEl.textContent = t.lyricsNotFound;
      meta.textContent = t.lyricsNotFound;
    } else {
      textEl.textContent = t.lyricsError;
      meta.textContent = t.lyricsError;
    }
    
    lyricsState.status = "error";
  }

  window.currentSongArtist = artist;
  window.currentSongTitle = title;
}

function startLyricsSync() {
  clearInterval(syncInterval);
  syncInterval = setInterval(() => {
    if (autoSyncEnabled && player && player.getCurrentTime) {
      syncLyricsToTime(player.getCurrentTime());
    }
  }, 500);
}

function cleanTitleAndArtist(rawTitle, rawArtist) {
    let title = rawTitle || "";
    let artist = rawArtist || "";

    // Remove all brackets and their content (parentheses, square brackets, Japanese quotes, etc.)
    title = title.replace(/\[[^\]]*\]|\([^)]*\)|［[^］]*］|【[^】]*】|「[^」]*」|『[^』]*』/g, "");

    // Remove common YouTube noise words (case-insensitive)
    title = title.replace(
        /official\s*(music\s*)?video|music\s*video|mv|lyrics?|lyric\s*video|ver\.?|HD|4K|provided\s*to\s*youtube\s*by|auto[-\s]*generated\s*by\s*youtube|topic/gi,
        ""
    );

    // Remove "feat.", "ft.", "featuring" and everything that follows them
    title = title.replace(/\s+[fF](?:ea)?t\.?\s+[^-–—]*/g, "");
    title = title.replace(/\s+[fF]eaturing\s+[^-–—]*/g, "");
    
    // Also remove if feat is followed by a dash
    title = title.replace(/\s+[fF](?:ea)?t\.?\s*[-–—]/g, "");
    title = title.replace(/\s+[fF]eaturing\s*[-–—]/g, "");

    // Clean up any remaining parentheses that might be empty or contain only spaces
    title = title.replace(/\(\s*\)/g, ""); // Remove empty parentheses
    title = title.replace(/\[\s*\]/g, ""); // Remove empty square brackets
    title = title.replace(/\（\s*\）/g, ""); // Remove empty full-width parentheses
    title = title.replace(/\［\s*\］/g, ""); // Remove empty full-width square brackets

    // Normalize dashes and collapse spaces
    title = title.replace(/[\uFF5E\u2013\u2014\-–—]+/g, "-");
    title = title.replace(/\s{2,}/g, " ").trim();

    let extractedArtist = artist.trim();
    let extractedTrack = title.trim();

    // Japanese "Artist「Track」" pattern (strongest)
    const jpMatch = rawTitle.match(/^(.+?)「(.+?)」/);
    if (jpMatch) {
        extractedArtist = jpMatch[1].trim();
        extractedTrack = jpMatch[2].trim();
    }
    // "Artist - Track" pattern (only if artist wasn't already extracted)
    else {
        const dashMatch = extractedTrack.match(/^(.+?)\s*-\s*(.+)$/);
        if (dashMatch) {
            extractedArtist = dashMatch[1].trim();
            extractedTrack = dashMatch[2].trim();
        }
    }

    // Clean up artist name
    extractedArtist = extractedArtist
        .replace(/[【】\[\]()「」『』]/g, "")
        .replace(/\s*-\s*topic$/i, "")
        .replace(/^[-–—]+|[-–—]+$/g, "")
        .trim();

    // Clean up track name (additional cleaning for feat patterns in the extracted track)
    extractedTrack = extractedTrack
        .replace(/[【】\[\]()「」『』]/g, "")
        .replace(/\s+[fF](?:ea)?t\.?\s+[^-–—]*/g, "")
        .replace(/\s+[fF]eaturing\s+[^-–—]*/g, "")
        .replace(/\(\s*\)/g, "") // Remove empty parentheses
        .replace(/\[\s*\]/g, "") // Remove empty square brackets
        .trim();

    // Avoid artist name repetition in track
    if (extractedTrack.toLowerCase().startsWith(extractedArtist.toLowerCase())) {
        extractedTrack = extractedTrack.slice(extractedArtist.length).trim();
    }

    // If track is empty or same as artist, try to extract from original title
    if (!extractedTrack || extractedTrack.toLowerCase() === extractedArtist.toLowerCase()) {
        const fallbackJP = rawTitle.match(/「(.+?)」/);
        if (fallbackJP) extractedTrack = fallbackJP[1].trim();
    }

    return { artist: extractedArtist, track: extractedTrack };
}

function loadLyricsFor(title, artist) {
  const { artist: cleanArtist, track: cleanTrack } = cleanTitleAndArtist(title, artist);
  console.log("🎵 Cleaned song:", cleanArtist, "-", cleanTrack);

  fetchLyrics(cleanTrack, cleanArtist);
  startLyricsSync();
}

// buttons
document.getElementById("toggleSyncBtn")?.addEventListener("click", () => {
    autoSyncEnabled = !autoSyncEnabled;
    const btn = document.getElementById("toggleSyncBtn");
    btn.textContent = autoSyncEnabled ? 
        translations[currentLang].autoSyncOn : 
        translations[currentLang].autoSyncOff;
});
document.getElementById("toggleTranslationBtn")?.addEventListener("click", () => {
    showOriginalFirst = !showOriginalFirst;
    const btn = document.getElementById("toggleTranslationBtn");
    const t = translations[currentLang];
    btn.title = showOriginalFirst ? t.originalFirst : t.translationFirst;
    btn.innerHTML = showOriginalFirst ? 
        `<i class='bx bx-sort-up'></i>` : 
        `<i class='bx bx-sort-down'></i>`;
    
    // Re-render lyrics
    if (lyricsData) {
        if (lyricsData.isLrc && lyricsData.lrcLines) {
            renderLrcLinesWithTranslation(lyricsData.lrcLines, translatedLyrics || []);
        } else if (lyricsData.plain) {
            renderPlainLyricsWithTranslation(lyricsData.plain, translatedLyrics || '');
        }
    }
});
document.getElementById("refreshLyricsBtn").addEventListener("click", async () => {
    // Use the stored actual video ID to find the original song object
    if (actualSelectedVideoId) {
        const currentSong = playlist.find(song => song.videoId === actualSelectedVideoId);
        if (currentSong) {
            // Pass the original, unmodified song name and author
            await loadLyricsFor(currentSong.songName, currentSong.authorName);
            return;
        }
    }
    
    // Fallback: read from the DOM (if something went wrong)
    const title = (document.querySelector("#nowPlaying .song-title")?.innerText || "").trim();
    const artist = (document.querySelector("#nowPlaying .author-name")?.innerText || "").trim();
    if (title) {
        await loadLyricsFor(title, artist);
    }
});
document.getElementById("openRawBtn").addEventListener("click", () => {
  if (!lyricsData) return alert(translations[currentLang].noLyricsLoaded);
  const blob = new Blob([JSON.stringify(lyricsData, null, 2)], { type: "application/json" });
  window.open(URL.createObjectURL(blob), "_blank");
});

/* ==================== Language System ==================== */
const translations = {
  en: {
    playerTitle: "YouTube Music Player",
    autoPlay: "Auto-Play",
    repeat: "Repeat",
    lyrics: "Lyrics",
    lyricsNoLoad: "No lyrics loaded",
    lyricsSyncedFound: "Synced lyrics found for",
    lyricsPlainFound: "Plain lyrics found for",
    lyricsNotFound: "Lyrics not found.",
    lyricsError: "Error fetching lyrics.",
    lyricsFetching: "Fetching lyrics...",
    autoSyncOn: "Auto-Sync: ON",
    autoSyncOff: "Auto-Sync: OFF",
    refresh: "Refresh",
    raw: "Raw Data",
    showPlaylist: "My Playlist",
    searchPlaylist: "Search your playlist...",
    clearSearch: "Clear search",
    searchPlaylistPlaceholder: "Search your playlist...",
    songName: "Song Name",
    authorName: "Author Name",
    dragToReorder: "Drag to reorder",
    numberHeader: "No.",
    actionHeader: "Action",
    songUnavailable: "This song is unavailable. Skipping in",
    seconds: "seconds",
    youtubeSearchTitle: "Search YouTube",
    youtubeSearchPlaceholder: "Search YouTube for songs to add...",
    youtubeSearchBtn: "Search",
    searchResultsTitle: "Search Results:",
    youtubeSearching: "Searching YouTube...",
    youtubeSearchError: "Unable to search YouTube. Please check your internet connection and try again.",
    youtubeApiKeyError: "YouTube API Key is not configured. Please ensure config.js is loaded and the key is set.",
    removeSongTitle: "Remove song",
    settingsTitle: "Settings",
    searchYouTubeTitle: "Search YouTube",
    exportTitle: "Export Playlist & Data",
    importTitle: "Import Playlist & Data",
    exportPlaylist: "Export Playlist & Data",
    importPlaylist: "Import Playlist & Data",
    clearCache: "Cache Manager",
    albumArtSpin: "Album Art Spin",
    showLyrics: "Lyrics",
    darkMode: "Dark Mode",
    toggleLyricsTooltip: "Toggle to show or hide lyrics",
    goTop: "Go to Top",
    creatorTitle: "Original Creator",
    creatorDesc: "Original creator of this YouTube Music Player project.",
    creatorBtn: "Original Creator",
    visitRepo: "Visit Repository",
    maintainerTitle: "Fork Maintainer",
    maintainerDesc: "Maintainer of <a href='https://github.com/Farwalker3/YouTube-Music-Player-Web' target='_blank'>this forked version</a> with enhanced features.",
    maintainerBtn: "Fork Maintainer",
    experimentalWindowTitle: "Experimental Project",
    experimentalWindowWarning: "⚠ Warning: This project may be unstable and unsafe. Use at your own risk.",
    readExcelTitle: "Read Excel Files Methods",
    readApiKeyTitle: "Read API Keys Methods",
    viewBetaBtn: "View Beta Test Project",
    viewAlphaBtn: "View Alpha Test Project",
    viewBetaTooltip: "View Beta Test Project",
    viewAlphaTooltip: "View Alpha Test Project",
    attributionText: "Original project by",
    attributionEnhanced: "Enhanced version by",
    attributionRepo: "Original Repository",
    languageLabel: "Language",
    songAlreadyExists: "This song is already in your playlist!",
    songAdded: " added to your playlist!",
    importFileTypeError: "Please select a JSON file or TXT file containing JSON data.",
    cacheCleared: "Search cache cleared! New searches will fetch fresh results.",
    exportError: "Error exporting playlist. Please try again.",
    importError: "Error importing playlist: ",
    fileReadError: "Error reading file. Please try again.",
    noLyricsLoaded: "No lyrics loaded.",
    clearCacheConfirm: "Are you sure you want to clear the search cache? This will remove all saved search results.",
    importConfirm: "Import ${count} songs? This will replace your current playlist.",
    importSuccess: "Successfully imported ${count} songs!",
    darkModeStatus: "Dark mode was ${status}.",
    albumArtSpinStatus: "Album art spin was ${status}.",
    lyricsPanelStatus: "Lyrics panel was ${status}.",
    languageSet: "Language set to ${language}.",
    enabled: "enabled",
    disabled: "disabled",
    chinese: "Chinese",
    english: "English",
    addToPlaylist: "Add to Playlist",
    add: "Add",
    invalidLink: "⚠ Invalid YouTube link provided.",
    duplicateSong: "⚠ This song is already in your playlist!",
    addedSong: (title, author) => `✅ Added "${title}" by ${author} to your playlist!`,
    aboutTitle: "About YouTube Music Player",
    aboutDescription: "A feature-rich web-based music player that uses YouTube as its music source. Play, manage, and organize your favorite music in a clean, intuitive interface.",
    featuresTitle: "Features",
    feature1: "YouTube music playback",
    feature2: "Playlist management with drag & drop",
    feature3: "Lyrics display with auto-sync",
    feature4: "Lyrics Translation",
    feature5: "Dark/Light mode",
    feature6: "Export/Import playlists",
    feature7: "Volume control & progress bar",
    feature8: "Multi-language support (English/中文)",
    feature9: "Auto-play & repeat modes",
    originalProjectTitle: "Original Project",
    originalCreator: "Original creator",
    contributorsTitle: "Contributors",
    forkMaintainer: "Fork maintainer",
    linksTitle: "Links",
    originalRepository: "Original Repository",
    versionInfoTitle: "Version Information",
    version: "Version: ",
    lastUpdated: "Last Updated: ",
    languages: "Languages: ",
    experimentalFeatures: "Experimental Features",
    settingsAboutTitle: "About this Project",
    settingsAbout: "About",
    albumArtDisplay: "Album Art Display:",
    spin: "Spin",
    none: "None",
    video: "Video",
    youtubeApi403Error: "YouTube API Error: 403 - Quota Exceeded. The API key has reached its daily limit. Please try again tomorrow or use a different API key.",
    translationStatus: "Lyrics translation was ${status}.",
    enableLyricsTranslation: "Lyrics Translation",
    showOriginalFirstLabel: "Show Original First",
    noResultsFound: "No results found.",
    cached: "(Cached)",
    searchCache: "Search Cache",
    lyricsCache: "Lyrics Cache",
    translationCache: "Translation Cache",
    unknown: "Unknown",
    viewDetails: "View Details",
    delete: "Delete",
    noCacheItems: "No cache items found",
    totalItems: "Total Items",
    totalSize: "Total Size",
    selectAll: "Select All",
    clearSelected: "Clear Selected",
    refresh: "Refresh",
    clearAll: "Clear All Cache",
    cacheManagerTitle: "Cache Manager",
    cacheItems: "Cache Items",
    cacheKey: "Cache Key",
    cacheType: "Type",
    cacheSize: "Size",
    cacheAge: "Age",
    actions: "Actions",
    confirmDeleteSelected: "Delete {count} selected item(s)?",
    confirmDeleteItem: "Delete this cache item?",
    confirmClearAllCache: "Are you sure you want to clear ALL cache? This cannot be undone.",
    noItemsSelected: "No items selected",
    copiedToClipboard: "Copied to clipboard!",
    cacheItemDetails: "Cache Details",
    cacheContent: "Content",
    copyContent: "Copy Content",
    deleteItem: "Delete Item",
    close: "Close",
    search: "Search",
    lyrics: "Lyrics",
    translation: "Translation",
    all: "All",
    itemsSelected: "{count} item(s) selected",
    cacheStats: "Cache Statistics",
    expiresIn: "Expires in",
    never: "Never",
    expired: "Expired",
    valid: "Valid",
    invalid: "Invalid",
  },
  zh: {
    playerTitle: "YouTube 音乐播放器",
    autoPlay: "自动播放",
    repeat: "重复播放",
    lyrics: "歌词",
    lyricsNoLoad: "尚未载入歌词",
    lyricsSyncedFound: "已找到同步歌词：",
    lyricsPlainFound: "已找到普通歌词：",
    lyricsNotFound: "未找到歌词。",
    lyricsError: "获取歌词时出错。",
    lyricsFetching: "正在载入歌词...",
    autoSyncOn: "自动同步：开启",
    autoSyncOff: "自动同步：关闭",
    refresh: "刷新",
    raw: "原始数据",
    showPlaylist: "我的播放列表",
    searchPlaylist: "搜索你的播放列表...",
    clearSearch: "清除搜索",
    searchPlaylistPlaceholder: "搜索你的播放列表...",
    songName: "歌曲名称",
    authorName: "作者名称",
    dragToReorder: "拖拽重新排序",
    numberHeader: "序号",
    actionHeader: "操作",
    songUnavailable: "此歌曲不可用。将在",
    seconds: "秒后跳过",
    youtubeSearchTitle: "搜索 YouTube",
    youtubeSearchPlaceholder: "在 YouTube 上搜索要添加的歌曲...",
    youtubeSearchBtn: "搜索",
    searchResultsTitle: "搜索结果：",
    youtubeSearching: "正在搜索 YouTube...",
    youtubeSearchError: "无法搜索 YouTube，请检查网络连接后重试。",
    youtubeApiKeyError: "YouTube API 密钥未配置。请确保已加载 config.js 并设置密钥。",
    removeSongTitle: "移除歌曲",
    settingsTitle: "设置",
    searchYouTubeTitle: "搜索 YouTube",
    exportTitle: "导出播放列表和数据",
    importTitle: "导入播放列表和数据",
    exportPlaylist: "导出播放列表和数据",
    importPlaylist: "导入播放列表和数据",
    clearCache: "缓存管理",
    albumArtSpin: "唱片旋转",
    showLyrics: "歌词",
    darkMode: "深色模式",
    toggleLyricsTooltip: "切换以显示或隐藏歌词",
    goTop: "返回顶部",
    creatorTitle: "原始创作者",
    creatorDesc: "此 YouTube 音乐播放器项目的原始创作者。",
    creatorBtn: "原始创作者",
    visitRepo: "访问仓库",
    maintainerTitle: "分支维护者",
    maintainerDesc: "此 <a href='https://github.com/Farwalker3/YouTube-Music-Player-Web' target='_blank'>分支</a> 的维护者，具有增强功能。",
    maintainerBtn: "分支维护者",
    experimentalWindowTitle: "实验性项目",
    experimentalWindowWarning: "⚠ 警告：此项目可能不稳定且存在风险，请自行承担使用风险。",
    readExcelTitle: "读取 Excel 文件方法",
    readApiKeyTitle: "读取 API 密钥方法",
    viewBetaBtn: "查看 Beta 测试项目",
    viewAlphaBtn: "查看 Alpha 测试项目",
    viewBetaTooltip: "查看 Beta 测试项目",
    viewAlphaTooltip: "查看 Alpha 测试项目",
    attributionText: "原始项目作者",
    attributionEnhanced: "增强版本维护者",
    attributionRepo: "原始仓库",
    languageLabel: "语言",
    songAlreadyExists: "此歌曲已在播放列表中！",
    songAdded: " 已添加到播放列表！",
    importFileTypeError: "请选择包含 JSON 数据的 JSON 文件或 TXT 文件。",
    cacheCleared: "搜索缓存已清除！新的搜索将获取最新结果。",
    exportError: "导出播放列表时出错，请重试。",
    importError: "导入播放列表时出错：",
    fileReadError: "读取文件时出错，请重试。",
    noLyricsLoaded: "未载入歌词。",
    clearCacheConfirm: "您确定要清除搜索缓存吗？这将删除所有保存的搜索结果。",
    importConfirm: "导入 ${count} 首歌曲？这将替换您当前的播放列表。",
    importSuccess: "成功导入 ${count} 首歌曲！",
    darkModeStatus: "深色模式已${status}。",
    albumArtSpinStatus: "唱片旋转已${status}。",
    lyricsPanelStatus: "歌词面板已${status}。",
    languageSet: "语言设置为${language}。",
    enabled: "启用",
    disabled: "关闭",
    chinese: "中文",
    english: "英文",
    addToPlaylist: "添加到播放列表",
    add: "添加",
    invalidLink: "⚠ 提供的 YouTube 链接无效。",
    duplicateSong: "⚠ 此歌曲已在播放列表中！",
    addedSong: (title, author) => `✅ 已成功将《${title}》 - ${author} 添加到播放列表！`,
    aboutTitle: "关于 YouTube 音乐播放器",
    aboutDescription: "一个功能丰富的基于网页的音乐播放器，使用 YouTube 作为音乐源。通过简洁直观的界面播放、管理和组织您喜爱的音乐。",
    featuresTitle: "功能特色",
    feature1: "YouTube 音乐播放",
    feature2: "支持拖拽的播放列表管理",
    feature3: "带自动同步的歌词显示",
    feature4: "歌词翻译",
    feature5: "深色/浅色模式",
    feature6: "导入/导出播放列表",
    feature7: "音量控制与进度条",
    feature8: "多语言支持 (英文/中文)",
    feature9: "自动播放和重复模式",
    originalProjectTitle: "原始项目",
    originalCreator: "原始创作者",
    contributorsTitle: "贡献者",
    forkMaintainer: "分支维护者",
    linksTitle: "链接",
    originalRepository: "原始仓库",
    versionInfoTitle: "版本信息",
    version: "版本: ",
    lastUpdated: "最后更新: ",
    languages: "支持语言: ",
    experimentalFeatures: "实验性功能",
    settingsAboutTitle: "关于此项目",
    settingsAbout: "关于",
    albumArtDisplay: "专辑封面显示:",
    spin: "旋转",
    none: "静止",
    video: "视频",
    youtubeApi403Error: "YouTube API 错误：403 - 配额已用尽。API 密钥已达到每日使用限制。请明天再试或使用其他 API 密钥。",
    translationStatus: "歌词翻译已${status}。",
    enableLyricsTranslation: "歌词翻译",
    showOriginalFirstLabel: "原文优先显示",
    noResultsFound: "未找到结果。",
    cached: "(已缓存)",
    searchCache: "搜索缓存",
    lyricsCache: "歌词缓存",
    translationCache: "翻译缓存",
    unknown: "未知",
    viewDetails: "查看详情",
    delete: "删除",
    noCacheItems: "未找到缓存项目",
    totalItems: "总项目数",
    totalSize: "总大小",
    selectAll: "全选",
    clearSelected: "清除选中",
    refresh: "刷新",
    clearAll: "清除所有缓存",
    cacheManagerTitle: "缓存管理",
    cacheItems: "缓存项目",
    cacheKey: "缓存键",
    cacheType: "类型",
    cacheSize: "大小",
    cacheAge: "时间",
    actions: "操作",
    confirmDeleteSelected: "删除选中的 {count} 个项目？",
    confirmDeleteItem: "删除此缓存项目？",
    confirmClearAllCache: "确定要清除所有缓存吗？此操作无法撤销。",
    noItemsSelected: "未选中任何项目",
    copiedToClipboard: "已复制到剪贴板！",
    cacheItemDetails: "缓存详情",
    cacheContent: "内容",
    copyContent: "复制内容",
    deleteItem: "删除项目",
    close: "关闭",
    search: "搜索",
    lyrics: "歌词",
    translation: "翻译",
    all: "全部",
    itemsSelected: "已选中 {count} 个项目",
    cacheStats: "缓存统计",
    expiresIn: "过期时间",
    never: "永不过期",
    expired: "已过期",
    valid: "有效",
    invalid: "无效",
  }
};

let currentLang = localStorage.getItem("language");

if (!currentLang) {
  const browserLang = navigator.language.toLowerCase();
  if (browserLang.includes("zh")) {
    currentLang = "zh";
    localStorage.setItem("language", "zh");
  } else {
    currentLang = "en";
    localStorage.setItem("language", "en");
  }
}

function updateLanguageButtons() {
  const enBtn = document.getElementById("lang-en");
  const zhBtn = document.getElementById("lang-zh");

  if (!enBtn || !zhBtn) return;

  if (currentLang === "en") {
    enBtn.classList.add("active");
    zhBtn.classList.remove("active");
  } else {
    zhBtn.classList.add("active");
    enBtn.classList.remove("active");
  }
}

document.getElementById("lang-en").addEventListener("click", () => {
  currentLang = "en";
  localStorage.setItem("language", "en");
  applyLanguage();
});

document.getElementById("lang-zh").addEventListener("click", () => {
  currentLang = "zh";
  localStorage.setItem("language", "zh");
  applyLanguage();
});

function applyLanguage(lang) {
    updateLanguageButtons();
    currentLang = lang;
    localStorage.setItem("language", lang);
    const t = translations[lang];

    // 🎧 Player & Labels
    document.querySelector("h5.card-title i.bxs-music")?.nextSibling?.nodeValue && 
    (document.querySelector("h5.card-title i.bxs-music").nextSibling.nodeValue = ` ${t.playerTitle}`);
    document.querySelector("#lyricsTitle")?.lastChild?.nodeValue && 
    (document.querySelector("#lyricsTitle").lastChild.nodeValue = ` ${t.lyrics}`);

    // Update playlist/lyrics toggle buttons
    const showSongListBtn = document.getElementById("showSongListBtn");
    const showLyricsBtn = document.getElementById("showLyricsBtn");

    if (showSongListBtn) {
        const textSpan = showSongListBtn.querySelector('.btn-text');
        if (textSpan) {
            textSpan.textContent = t.showPlaylist;
        } else {
            // Fallback if no span element
            showSongListBtn.innerHTML = `<i class='bx bxs-playlist'></i> ${t.showPlaylist}`;
        }
    }

    if (showLyricsBtn) {
        const textSpan = showLyricsBtn.querySelector('.btn-text');
        if (textSpan) {
            textSpan.textContent = t.showLyrics;
        } else {
            // Fallback if no span element
            showLyricsBtn.innerHTML = `<i class='bi bi-music-note-list'></i> ${t.showLyrics}`;
        }
    }

    // ✅ Keep current meaning when switching language
    const meta = document.getElementById("lyricsMeta");
    const textEl = document.getElementById("lyricsText");

    switch (lyricsState.status) {
    case "idle":
        meta.textContent = t.lyricsNoLoad;
        textEl.textContent = t.lyricsNoLoad;
        break;
    case "loading":
        meta.textContent = t.searching;
        textEl.textContent = t.searching;
        break;
    case "synced":
        meta.textContent = `${t.lyricsSyncedFound} ${lyricsState.artist} – ${lyricsState.title}`;
        break;
    case "plain":
        meta.textContent = `${t.lyricsPlainFound} ${lyricsState.artist} – ${lyricsState.title}`;
        break;
    case "error":
        meta.textContent = t.lyricsError;
        textEl.textContent = t.lyricsNotFound;
        break;
    default:
        meta.textContent = t.lyricsNoLoad;
        textEl.textContent = t.lyricsNoLoad;
    }

    if (translationEnabled && lyricsData && lyricsState.status !== "loading") {
        const title = lyricsState.title;
        const artist = lyricsState.artist;
        if (title && artist) {
            // Show loading message for translation
            const meta = document.getElementById("lyricsMeta");
            const textEl = document.getElementById("lyricsText");
            const translateStatus = lang === 'zh' ? '正在翻译...' : 'Translating...';
            
            if (lyricsState.status === "synced") {
                meta.textContent = `${t.lyricsSyncedFound} ${artist} – ${title} (${translateStatus})`;
            } else if (lyricsState.status === "plain") {
                meta.textContent = `${t.lyricsPlainFound} ${artist} – ${title} (${translateStatus})`;
            }
            textEl.textContent = translateStatus;
            
            // Fetch lyrics with translation to new language
            fetchLyricsWithTranslation(title, artist);
        }
    }

    document.querySelector("#toggleSyncBtn") && (document.querySelector("#toggleSyncBtn").textContent = t.autoSyncOn);
    document.querySelector("#refreshLyricsBtn") && (document.querySelector("#refreshLyricsBtn").textContent = t.refresh);
    document.querySelector("#openRawBtn") && (document.querySelector("#openRawBtn").textContent = t.raw);

    // Add this line to the applyLanguage function
    document.getElementById("autoPlayText") && (document.getElementById("autoPlayText").textContent = t.autoPlay);
    document.querySelector("#repeatBtn")?.nextElementSibling && 
    (document.querySelector("#repeatBtn").nextElementSibling.textContent = t.repeat);

    document.querySelector("#searchPlaylistInput")?.setAttribute("placeholder", t.searchPlaylist);
    document.querySelector(".fw-bold.border-bottom span:first-child")?.textContent && 
    (document.querySelector(".fw-bold.border-bottom span:first-child").textContent = t.songName);
    document.querySelector(".fw-bold.border-bottom span:last-child")?.textContent && 
    (document.querySelector(".fw-bold.border-bottom span:last-child").textContent = t.authorName);

    document.querySelector(".bxs-videos")?.parentElement && 
    (document.querySelector(".bxs-videos").parentElement.lastChild.textContent = ` ${t.videoPlayer}`);

    document.querySelector("#goTopBtn")?.setAttribute("title", t.goTop);

    // Floating settings button
    document.getElementById("settingsBtn")?.setAttribute("title", t.settingsTitle);

    // YouTube search button
    document.getElementById("youtubeSearchBtn")?.setAttribute("title", t.searchYouTubeTitle);

    // Remove song buttons (loop all)
    document.querySelectorAll(".remove-song-btn").forEach(btn => {
    btn.setAttribute("title", t.removeSongTitle);
    });

    // Settings submenu buttons
    document.querySelector("#settingsExportBtn")?.setAttribute("title", t.exportTitle);
    document.querySelector("#settingsImportBtn")?.setAttribute("title", t.importTitle);
    document.querySelector("#settingsClearCacheBtn")?.setAttribute("title", t.clearCache);


    // 🧩 Settings Menu
    document.querySelector(".settings-header h6")?.childNodes[1] && 
    (document.querySelector(".settings-header h6").childNodes[1].nodeValue = ` ${t.settingsTitle}`);
    document.querySelector("#settingsExportBtn") && (document.querySelector("#settingsExportBtn").innerHTML = `<i class='bx bx-export'></i> ${t.exportPlaylist}`);
    document.querySelector("#settingsImportBtn") && (document.querySelector("#settingsImportBtn").innerHTML = `<i class='bx bx-import'></i> ${t.importPlaylist}`);
    document.querySelector("#settingsClearCacheBtn") && (document.querySelector("#settingsClearCacheBtn").innerHTML = `<i class='bx bx-trash'></i> ${t.clearCache}`);
    document.querySelector("label[for='albumArtSpinToggle']") && (document.querySelector("label[for='albumArtSpinToggle']").textContent = t.albumArtSpin);
    document.querySelector("label[for='lyricsToggle']") && (document.querySelector("label[for='lyricsToggle']").textContent = t.showLyrics);
    document.querySelector("label[for='darkModeToggle']") && (document.querySelector("label[for='darkModeToggle']").textContent = t.darkMode);
    const darkModeBtn = document.getElementById("darkModeToggle");
    if (darkModeBtn) {
    const isDarkMode = document.body.classList.contains("dark-mode");
    darkModeBtn.textContent = isDarkMode ? t.darkModeDisable : t.darkModeEnable;
    }
    document.querySelector(".bxs-moon")?.parentElement && 
    (document.querySelector(".bxs-moon").parentElement.lastChild.textContent = ` ${t.darkMode}`);

    // 🔍 YouTube Search
    document.querySelector(".bxs-search")?.parentElement && 
    (document.querySelector(".bxs-search").parentElement.lastChild.textContent = ` ${t.searchYouTube}`);
    document.querySelector("#youtubeSearchInput")?.setAttribute("placeholder", t.searchPlaceholder);
    document.querySelector("#searchLoading p") && (document.querySelector("#searchLoading p").textContent = t.searching);

    if (document.getElementById("searchResultsTitle"))
    document.getElementById("searchResultsTitle").textContent = t.searchResultsTitle;

    // Update search error messages if they're currently visible
    const searchError = document.getElementById("searchError");
    if (searchError && !searchError.classList.contains("d-none")) {
        const currentErrorText = searchError.textContent || searchError.innerText;
        
        // Check what type of error is currently displayed and preserve it
        if (currentErrorText.includes("403") || currentErrorText.includes("403") || currentErrorText.includes("daily limit")) {
            // This is a quota exceeded error - use the specific translation
            searchError.innerHTML = `<i class='bx bx-error'></i> ${t.youtubeApi403Error}`;
        } else if (currentErrorText.includes("API Key is not configured") || currentErrorText.includes("config.js") || currentErrorText.includes("YOUR_YOUTUBE_API_KEY")) {
            // This is an API key configuration error
            searchError.innerHTML = `<i class='bx bx-error'></i> ${t.youtubeApiKeyError}`;
        } else if (currentErrorText.includes("Unable to search") || currentErrorText.includes("internet connection")) {
            // This is a general search error
            searchError.innerHTML = `<i class='bx bx-error'></i> ${t.youtubeSearchError}`;
        } else {
            // For any other error, preserve the original text but update the icon
            const errorText = currentErrorText.replace(/^⚠\s*/, '').replace(/^<i class='bx bx-error'><\/i>\s*/, '');
            searchError.innerHTML = `<i class='bx bx-error'></i> ${errorText}`;
        }
    }
    
    // 🔍 YouTube Search Section
    document.getElementById("youtubeSearchTitle") &&
    (document.getElementById("youtubeSearchTitle").innerHTML = `<i class='bx bx-search'></i> ${t.youtubeSearchTitle}`);

    document.getElementById("youtubeSearchInput") &&
    (document.getElementById("youtubeSearchInput").placeholder = t.youtubeSearchPlaceholder);

    document.getElementById("youtubeSearchBtn") &&
    ((document.getElementById("youtubeSearchBtn").innerHTML = `<i class='bx bx-search'></i> ${t.youtubeSearchBtn}`),
    document.getElementById("youtubeSearchBtn").setAttribute("title", t.youtubeSearchTitle));

    document.getElementById("youtubeResultsTitle") &&
    (document.getElementById("youtubeResultsTitle").textContent = t.youtubeResultsTitle);

    document.getElementById("youtubeSearchingText") &&
    (document.getElementById("youtubeSearchingText").textContent = t.youtubeSearching);

    document.getElementById("youtubeSearchErrorText") &&
    (document.getElementById("youtubeSearchErrorText").textContent = t.youtubeSearchError);

    // 🧪 Experimental Project Section
    document.getElementById("experimentalWindowTitle") && 
    (document.getElementById("experimentalWindowTitle").innerHTML = `<i class='bx bxs-flask'></i> ${t.experimentalWindowTitle}`);

    document.getElementById("experimentalWindowWarning") && 
    (document.getElementById("experimentalWindowWarning").textContent = t.experimentalWindowWarning);

    document.getElementById("readExcelTitle") && 
    (document.getElementById("readExcelTitle").innerHTML = `<i class='bx bxs-file'></i> ${t.readExcelTitle}`);

    document.getElementById("readApiKeyTitle") && 
    (document.getElementById("readApiKeyTitle").innerHTML = `<i class='bx bxs-key'></i> ${t.readApiKeyTitle}`);

    document.getElementById("viewBetaBtn") && 
    ((document.getElementById("viewBetaBtn").textContent = t.viewBetaBtn),
    document.getElementById("viewBetaBtn").setAttribute("title", t.viewBetaTooltip));

    document.getElementById("viewAlphaBtn") && 
    ((document.getElementById("viewAlphaBtn").textContent = t.viewAlphaBtn),
    document.getElementById("viewAlphaBtn").setAttribute("title", t.viewAlphaTooltip));


    // 🎨 Attribution Section (footer)
    document.getElementById("attributionText") && 
    (document.getElementById("attributionText").textContent = t.attributionText);

    document.getElementById("attributionEnhanced") && 
    (document.getElementById("attributionEnhanced").textContent = t.attributionEnhanced);

    document.getElementById("attributionRepo") && 
    (document.getElementById("attributionRepo").textContent = t.attributionRepo);

    // 🌐 Language Switch Section
    if (document.getElementById("languageLabel"))
    document.getElementById("languageLabel").textContent = t.languageLabel;

    document.querySelector('.number-header') && (document.querySelector('.number-header').textContent = t.numberHeader);
    document.querySelector('.song-header') && (document.querySelector('.song-header').textContent = t.songName);
    document.querySelector('.author-header') && (document.querySelector('.author-header').textContent = t.authorName);
    document.querySelector('.action-header') && (document.querySelector('.action-header').textContent = t.actionHeader);

    document.querySelectorAll('.drag-handle').forEach(handle => {
        handle.setAttribute('title', t.dragToReorder);
    });

    const searchPlaylistInput = document.getElementById('searchPlaylistInput');
    if (searchPlaylistInput) {
        searchPlaylistInput.setAttribute('placeholder', t.searchPlaylistPlaceholder);
    }
    
    const clearBtn = document.getElementById('clearPlaylistSearchBtn');
    if (clearBtn && !clearBtn.classList.contains('d-none')) {
        clearBtn.setAttribute('title', t.clearSearch);
    }

    document.querySelectorAll(".add-from-search-btn").forEach(btn => {
        btn.setAttribute("title", t.addToPlaylist);
        btn.innerHTML = `<i class='bx bx-plus'></i> ${t.add}`;
    });

    document.querySelectorAll(".add-song-btn").forEach(btn => {
        btn.setAttribute("title", t.addToPlaylist);
        btn.innerHTML = `<i class='bx bx-plus'></i> ${t.add}`;
    });

    // 🎨 About window translations
    document.querySelectorAll('[data-translate]').forEach(el => {
        const key = el.getAttribute('data-translate');
        if (t[key]) {
            el.textContent = t[key];
        }
    });
    
    // Update title attributes
    document.querySelectorAll('[data-translate-title]').forEach(el => {
        const key = el.getAttribute('data-translate-title');
        if (t[key]) {
            el.setAttribute('title', t[key]);
        }
    });

    document.querySelector('.album-art-display-toggle .fw-bold').textContent = translations[lang].albumArtDisplay || 'Album Art Display:';
    
    // Update the toggle button texts
    const spinBtn = document.querySelector('#albumArtDisplayToggle [data-mode="spin"]');
    const noneBtn = document.querySelector('#albumArtDisplayToggle [data-mode="none"]');
    const videoBtn = document.querySelector('#albumArtDisplayToggle [data-mode="video"]');
    
    if (spinBtn) spinBtn.textContent = translations[lang].spin || 'Spin';
    if (noneBtn) noneBtn.textContent = translations[lang].none || 'None';
    if (videoBtn) videoBtn.textContent = translations[lang].video || 'Video';

    const dateElement = document.getElementById('formattedDate');
    if (dateElement) {
        const originalDate = dateElement.getAttribute('data-original-date');
        
        // Format it based on the current language
        dateElement.textContent = formatDateForLanguage(lang, originalDate);
    }

    document.querySelectorAll('[data-translate]').forEach(el => {
        const key = el.getAttribute('data-translate');
        if (t[key]) {
            el.textContent = t[key];
        }
    });
}

// 🌐 Language switch event
document.getElementById("lang-en")?.addEventListener("click", () => {
  applyLanguage("en");
  document.getElementById("lang-en").classList.add("active");
  document.getElementById("lang-zh").classList.remove("active");
});

document.getElementById("lang-zh")?.addEventListener("click", () => {
  applyLanguage("zh");
  document.getElementById("lang-zh").classList.add("active");
  document.getElementById("lang-en").classList.remove("active");
});

// Apply saved language on page load
document.addEventListener("DOMContentLoaded", () => applyLanguage(currentLang));

// Experimental window functionality
document.addEventListener('DOMContentLoaded', function() {
    const experimentalBtn = document.getElementById('experimentalBtn');
    const experimentalWindow = document.getElementById('experimentalWindow');
    const floatingExperimental = document.querySelector('.floating-experimental');
    const experimentalCloseBtn = document.querySelector('.experimental-close-btn');
    
    // Toggle experimental window with animation
    experimentalBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        const isOpening = !experimentalWindow.classList.contains('show');
        
        if (isOpening) {
            floatingExperimental.classList.add('active');
            experimentalWindow.classList.add('show');
        } else {
            closeExperimentalWindow();
        }
    });
    
    // Close window when close button is clicked
    experimentalCloseBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        closeExperimentalWindow();
    });
    
    // Close window when clicking outside
    document.addEventListener('click', function(event) {
        if (!event.target.closest(".floating-experimental") && experimentalWindow.classList.contains('show')) {
            closeExperimentalWindow();
        }
    });
    
    // Also close with Escape key
    document.addEventListener('keydown', function(event) {
        if (event.key === "Escape" && experimentalWindow.classList.contains('show')) {
            closeExperimentalWindow();
        }
    });
    
    // Function to close experimental window with smooth animation
    function closeExperimentalWindow() {
        experimentalWindow.classList.remove('show');
        setTimeout(() => {
            floatingExperimental.classList.remove('active');
        }, 300);
    }
});

// About window functionality
document.addEventListener('DOMContentLoaded', function() {
    const settingsAboutBtn = document.getElementById('settingsAboutBtn');
    const aboutWindow = document.getElementById('aboutWindow');
    const aboutCloseBtn = document.querySelector('.about-close-btn');
    
    // Create overlay backdrop
    const aboutOverlay = document.createElement('div');
    aboutOverlay.className = 'about-overlay';
    document.body.appendChild(aboutOverlay);
    
    // Open About window
    settingsAboutBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        openAboutWindow();
    });
    
    // Close About window with close button
    aboutCloseBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        closeAboutWindow();
    });
    
    // Close About window when clicking overlay
    aboutOverlay.addEventListener('click', function(e) {
        e.stopPropagation();
        closeAboutWindow();
    });
    
    // Close About window with Escape key
    document.addEventListener('keydown', function(event) {
        if (event.key === "Escape" && aboutWindow.classList.contains('show')) {
            closeAboutWindow();
        }
    });
    
    // Prevent closing when clicking inside about window
    aboutWindow.addEventListener('click', function(e) {
        e.stopPropagation();
    });
    
    // Function to open About window
    function openAboutWindow() {
        aboutWindow.classList.add('show');
        aboutOverlay.classList.add('show');
        document.body.style.overflow = 'hidden'; // Prevent scrolling
    }
    
    // Function to close About window
    function closeAboutWindow() {
        aboutWindow.classList.remove('show');
        aboutOverlay.classList.remove('show');
        document.body.style.overflow = ''; // Restore scrolling
    }
});

function formatDateForLanguage(lang, dateString) {
    const dateMatch = dateString.match(/(\d+)d (\d+)m (\d+)y/);
    if (!dateMatch) return dateString;
    
    const days = parseInt(dateMatch[1]);
    const months = parseInt(dateMatch[2]);
    const year = parseInt(dateMatch[3]);
    
    if (lang === 'zh') {
        // Chinese format: 年-月-日
        return `${year}年 ${months}月 ${days}日`;
    } else {
        // English format: Month Day, Year
        const monthNames = [
            "January", "February", "March", "April", "May", "June",
            "July", "August", "September", "October", "November", "December"
        ];
        return `${monthNames[months - 1]} ${days}, ${year}`;
    }
}

// ========== AUTO BUILD DATE ==========
async function updateBuildDate() {
    const dateElement = document.getElementById('formattedDate');
    if (!dateElement) return;

    // List of files to check (add/remove any core files)
    const filesToCheck = [
        'index.html',
        'style.css',
        'script.js'
    ];

    let latestDate = null;

    // Start with the current HTML document's last modified as a baseline
    if (document.lastModified) {
        const d = new Date(document.lastModified);
        if (!isNaN(d.getTime())) latestDate = d;
    }

    try {
        // Fetch each file's HEAD to get Last-Modified header
        const fetchPromises = filesToCheck.map(async (file) => {
            try {
                const response = await fetch(file, { method: 'HEAD' });
                if (response.ok) {
                    const lastModified = response.headers.get('Last-Modified');
                    if (lastModified) return new Date(lastModified);
                }
            } catch (e) {
                // Silently ignore (file may not exist, CORS, network error)
                console.warn(`Could not fetch Last-Modified for ${file}`, e);
            }
            return null;
        });

        const dates = await Promise.all(fetchPromises);

        // Filter out invalid dates
        const validDates = dates.filter(d => d && !isNaN(d.getTime()));
        
        // Add the document date again just to be safe
        if (document.lastModified) {
            const docDate = new Date(document.lastModified);
            if (!isNaN(docDate.getTime())) validDates.push(docDate);
        }

        // Find the most recent date among all
        if (validDates.length > 0) {
            const maxDate = new Date(Math.max(...validDates.map(d => d.getTime())));
            if (!latestDate || maxDate > latestDate) {
                latestDate = maxDate;
            }
        }
    } catch (error) {
        console.warn("Could not fetch file dates, using document.lastModified fallback", error);
    }

    // Update the data attribute with the determined date
    if (latestDate) {
        const day = latestDate.getDate();
        const month = latestDate.getMonth() + 1; // months are 0-indexed
        const year = latestDate.getFullYear();
        const dateString = `${day}d ${month}m ${year}y`;
        dateElement.setAttribute('data-original-date', dateString);
    } else {
        // Ultimate fallback (keep the existing attribute or set default)
        if (!dateElement.getAttribute('data-original-date')) {
            dateElement.setAttribute('data-original-date', '19d 6m 2026y');
        }
    }

    // Re-apply current language formatting to update the displayed date
    applyLanguage(currentLang);
}

document.addEventListener('DOMContentLoaded', function() {
    applyLanguage(currentLang);
    updateBuildDate();
});

/* ================ LYRICS TRANSLATION SYSTEM ================ */
let translatedLyrics = null;
let translationEnabled = false;
let showOriginalFirst = true; // true: original first, false: translated first

// Cache for translations to minimize API calls
const translationCache = JSON.parse(localStorage.getItem('lyricsTranslationCache') || '{}');
const TRANSLATION_CACHE_EXPIRY = 86400000; // 24 hours in milliseconds

async function translateLyrics(text, sourceLang = 'auto', targetLang = currentLang === 'zh' ? 'zh' : 'en') {
    // Check cache first
    const cacheKey = `${sourceLang}-${targetLang}-${text.substring(0, 100)}`;
    const cached = translationCache[cacheKey];
    
    if (cached && (Date.now() - cached.timestamp < TRANSLATION_CACHE_EXPIRY)) {
        console.log("Using cached translation");
        return cached.translation;
    }
    
    // Don't translate if target language is same as source
    if (sourceLang === targetLang) {
        return text;
    }
    
    // Don't translate if text is too short or empty
    if (!text || text.trim().length < 2) {
        return text;
    }
    
    if (text.length > 500) {
        console.log("Text too long, splitting by newlines and translating line by line");
        const lines = text.split('\n');
        const translatedLines = [];
        
        for (let line of lines) {
            if (line.trim().length === 0) {
                translatedLines.push(line);
                continue;
            }
            
            try {
                const translatedLine = await translateSingleLine(line, sourceLang, targetLang);
                translatedLines.push(translatedLine);
            } catch (error) {
                console.log(`Failed to translate line: "${line}", using original`);
                translatedLines.push(line);
            }
            
            // Small delay between lines to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        const result = translatedLines.join('\n');
        
        // Cache the result
        translationCache[cacheKey] = {
            translation: result,
            timestamp: Date.now()
        };
        localStorage.setItem('lyricsTranslationCache', JSON.stringify(translationCache));
        
        return result;
    }
    
    // Try multiple translation services as fallback for shorter texts
    return await translateSingleLine(text, sourceLang, targetLang, cacheKey);
}

async function translateSingleLine(text, sourceLang, targetLang, cacheKey = null) {
    const translationServices = [
        // Service 1: LibreTranslate (primary)
        async (text, source, target) => {
            try {
                // LibreTranslate language codes mapping
                const libreCodes = {
                    'en': 'en',
                    'zh': 'zh',
                    'ja': 'ja',
                    'ko': 'ko'
                };
                
                const libreSource = libreCodes[source] || source;
                const libreTarget = libreCodes[target] || target;
                
                // Skip if LibreTranslate doesn't support this language pair directly
                const supportedPairs = [
                    'en-zh', 'zh-en',
                    'en-ja', 'ja-en',
                    'en-ko', 'ko-en'
                ];
                
                if (!supportedPairs.includes(`${libreSource}-${libreTarget}`) && 
                    !supportedPairs.includes(`${libreTarget}-${libreSource}`)) {
                    throw new Error('Language pair not directly supported');
                }
                
                const response = await fetch('https://libretranslate.com/translate', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        q: text,
                        source: libreSource,
                        target: libreTarget,
                        format: 'text'
                    })
                });
                
                if (!response.ok) throw new Error('LibreTranslate failed');
                
                const data = await response.json();
                return data.translatedText;
            } catch (error) {
                console.log('LibreTranslate failed, trying next service');
                throw error;
            }
        },
        
        // Service 2: MyMemory (fallback 1) - better for CJK languages
        async (text, source, target) => {
            try {
                // MyMemory API uses language codes like "en" for English, "zh-CN" for Chinese
                const myMemorySource = source === 'zh' ? 'zh-CN' : 
                                     source === 'ja' ? 'ja' :
                                     source === 'ko' ? 'ko' : source;
                
                const myMemoryTarget = target === 'zh' ? 'zh-CN' :
                                     target === 'ja' ? 'ja' :
                                     target === 'ko' ? 'ko' : target;
                
                const response = await fetch(
                    `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${myMemorySource}|${myMemoryTarget}`
                );
                
                if (!response.ok) throw new Error('MyMemory failed');
                
                const data = await response.json();
                return data.responseData.translatedText;
            } catch (error) {
                console.log('MyMemory failed, trying next service');
                throw error;
            }
        },
        
        // Service 3: Google Translate (unofficial API)
        async (text, source, target) => {
            try {
                const googleLangCodes = {
                    'en': 'en',
                    'zh': 'zh-CN',
                    'ja': 'ja',
                    'ko': 'ko'
                };
                
                const googleSource = googleLangCodes[source] || source;
                const googleTarget = googleLangCodes[target] || target;
                
                // Use a public Google Translate proxy
                const response = await fetch(
                    `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${googleSource}&tl=${googleTarget}&dt=t&q=${encodeURIComponent(text)}`
                );
                
                if (!response.ok) throw new Error('Google Translate failed');
                
                const data = await response.json();
                // Extract translation from the response format
                return data[0].map(item => item[0]).join('');
            } catch (error) {
                console.log('Google Translate failed');
                throw error;
            }
        }
    ];
    
    let lastError = null;
    
    // Try each service in order
    for (let i = 0; i < translationServices.length; i++) {
        try {
            const translatedText = await translationServices[i](text, sourceLang, targetLang);
            
            // Validate that we got a translation
            if (translatedText && translatedText !== text) {
                // Cache the translation if cacheKey is provided
                if (cacheKey) {
                    translationCache[cacheKey] = {
                        translation: translatedText,
                        timestamp: Date.now()
                    };
                    localStorage.setItem('lyricsTranslationCache', JSON.stringify(translationCache));
                }
                
                console.log(`Translation successful with service ${i + 1}`);
                return translatedText;
            }
        } catch (error) {
            lastError = error;
            console.log(`Translation service ${i + 1} failed:`, error.message);
        }
    }
    
    // If all services fail, return original text
    console.warn('All translation services failed, returning original text');
    return text;
}

function clearExpiredTranslationCache() {
    let hasChanges = false;
    const now = Date.now();
    
    for (const key in translationCache) {
        if (now - translationCache[key].timestamp > TRANSLATION_CACHE_EXPIRY) {
            delete translationCache[key];
            hasChanges = true;
        }
    }
    
    if (hasChanges) {
        localStorage.setItem('lyricsTranslationCache', JSON.stringify(translationCache));
    }
}

// Call this on startup
clearExpiredTranslationCache();

async function detectLanguage(text) {
    // Simple language detection based on character analysis
    const chinesePattern = /[\u4e00-\u9fff]/; // Chinese characters
    const japanesePattern = /[\u3040-\u309f\u30a0-\u30ff\u4e00-\u9fff]/; // Japanese
    const koreanPattern = /[\uac00-\ud7af]/; // Korean
    
    // Check character counts
    let chineseCount = 0;
    let japaneseCount = 0;
    let koreanCount = 0;
    let englishCount = 0;
    
    for (let char of text) {
        if (chinesePattern.test(char)) chineseCount++;
        if (japanesePattern.test(char)) japaneseCount++;
        if (koreanPattern.test(char)) koreanCount++;
        if (/[a-zA-Z]/.test(char)) englishCount++;
    }
    
    // If there's a significant amount of CJK characters, use that language
    if (chineseCount > japaneseCount && chineseCount > koreanCount) return 'zh';
    if (japaneseCount > chineseCount && japaneseCount > koreanCount) return 'ja';
    if (koreanCount > chineseCount && koreanCount > japaneseCount) return 'ko';
    
    // Fallback to English for Latin scripts or mixed content
    return 'en';
}

async function translateLyricsLines(lines, targetLang) {
    const sourceLang = await detectLanguage(lines.map(l => l.text).join(' '));
    
    // Don't translate if source and target are the same
    if ((sourceLang === 'en' && targetLang === 'en') || 
        (sourceLang === 'zh' && targetLang === 'zh') ||
        (sourceLang === 'ja' && targetLang === 'ja') ||
        (sourceLang === 'ko' && targetLang === 'ko')) {
        return lines.map(line => line.text);
    }
    
    const translatedLines = [];
    
    // Translate in chunks to avoid overwhelming the API
    for (let i = 0; i < lines.length; i += 5) {
        const chunk = lines.slice(i, i + 5);
        const chunkText = chunk.map(l => l.text).join('\n');
        
        // Skip translation if chunk is empty
        if (!chunkText.trim()) {
            for (let j = 0; j < chunk.length; j++) {
                translatedLines.push(chunk[j].text);
            }
            continue;
        }
        
        try {
            let translatedChunk;
            
            // First, detect if we need English as an intermediate language
            const sourceIsCJK = ['zh', 'ja', 'ko'].includes(sourceLang);
            const targetIsCJK = ['zh', 'ja', 'ko'].includes(targetLang);
            
            if (sourceIsCJK && targetIsCJK && sourceLang !== targetLang) {
                // CJK-to-CJK translation: Try English as intermediate
                // Step 1: Translate to English first
                const englishChunk = await translateLyrics(chunkText, sourceLang, 'en');
                
                // Step 2: Translate from English to target language
                translatedChunk = await translateLyrics(englishChunk, 'en', targetLang);
            } else {
                // Direct translation
                translatedChunk = await translateLyrics(chunkText, sourceLang, targetLang);
            }
            
            const translatedLinesChunk = translatedChunk.split('\n');
            
            // Ensure we have the same number of lines
            for (let j = 0; j < chunk.length; j++) {
                // Preserve empty lines as empty
                if (chunk[j].text.trim() === '') {
                    translatedLines.push('');
                } else {
                    translatedLines.push(translatedLinesChunk[j] || chunk[j].text);
                }
            }
        } catch (error) {
            // If translation fails, use original text for this chunk
            for (let j = 0; j < chunk.length; j++) {
                translatedLines.push(chunk[j].text);
            }
        }
        
        // Small delay to be respectful to the API
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    return translatedLines;
}

function renderLrcLinesWithTranslation(lines, translations = []) {
    const el = document.getElementById("lyricsText");
    const targetLang = currentLang === 'zh' ? 'zh' : 'en';
    
    el.innerHTML = lines
        .map((l, i) => {
            const m = Math.floor(l.time / 60);
            const s = Math.floor(l.time % 60);
            const formattedTime = `${m}:${s < 10 ? "0" + s : s}`;
            
            // Check if this line has translation
            const hasTranslation = translations[i] !== undefined && translations[i] !== null && 
                                 translations[i] !== '' && translations[i] !== l.text;
            
            // Get the translation text for this specific line
            const translationText = hasTranslation ? translations[i] : '';
            
            // Determine display order based on setting
            const firstText = showOriginalFirst ? l.text : translationText;
            const secondText = showOriginalFirst ? translationText : l.text;
            const firstLabel = showOriginalFirst ? 
                (targetLang === 'zh' ? '原文' : 'Original') : 
                (targetLang === 'zh' ? '译文' : 'Translation');
            const secondLabel = showOriginalFirst ? 
                (targetLang === 'zh' ? '译文' : 'Translation') : 
                (targetLang === 'zh' ? '原文' : 'Original');
            
            // Only show translation container if we actually have a translation for THIS line
            const shouldShowTranslation = hasTranslation && translationText.trim().length > 0;
            
            return `
                <div class="lrc-line" data-index="${i}" data-time="${l.time}" data-formatted-time="${formattedTime}">
                    <span class="lrc-time">[${formattedTime}]</span>
                    <div class="lyrics-pair">
                        <div class="original-lyric" data-label="${firstLabel}">
                            ${firstText || l.text || ' '}
                        </div>
                        ${shouldShowTranslation ? `
                        <div class="translated-lyric" data-label="${secondLabel}">
                            ${secondText}
                        </div>
                        ` : ''}
                    </div>
                </div>`;
        })
        .join("");
}

function renderPlainLyricsWithTranslation(plainText, translation = '') {
    const el = document.getElementById("lyricsText");
    const targetLang = currentLang === 'zh' ? 'zh' : 'en';
    const hasTranslation = translation && translation !== plainText;
    
    const lines = plainText.split(/\r?\n/).filter(l => l.trim().length > 0);
    const translatedLines = hasTranslation ? translation.split(/\r?\n/) : [];
    
    // Ensure we have the same number of lines
    while (translatedLines.length < lines.length) {
        translatedLines.push('');
    }
    
    // Determine display order based on setting
    const firstLabel = showOriginalFirst ? 
        (targetLang === 'zh' ? '原文' : 'Original') : 
        (targetLang === 'zh' ? '译文' : 'Translation');
    const secondLabel = showOriginalFirst ? 
        (targetLang === 'zh' ? '译文' : 'Translation') : 
        (targetLang === 'zh' ? '原文' : 'Original');
    
    el.innerHTML = lines
        .map((line, i) => {
        const firstText = showOriginalFirst ? line : (translatedLines[i] || '');
        const secondText = showOriginalFirst ? (translatedLines[i] || '') : line;
        const hasTranslatedLine = translatedLines[i] && translatedLines[i].trim().length > 0;
        
        return `
            <div class="plain-line">
            <div class="lyrics-pair">
                <div class="original-lyric" data-label="${firstLabel}">${firstText}</div>
                ${hasTranslatedLine ? `
                <div class="translated-lyric" data-label="${secondLabel}">${secondText}</div>
                ` : ''}
            </div>
            </div>`;
        })
        .join("");
}

function initLyricsClickToSeek() {
    const lyricsContainer = document.getElementById("lyricsText");
    
    lyricsContainer.addEventListener("click", function(e) {
        // Find the clicked lyrics line
        let target = e.target;
        
        // Traverse up to find the lrc-line element
        while (target && !target.classList.contains("lrc-line") && target !== lyricsContainer) {
        target = target.parentElement;
        }
        
        if (target && target.classList.contains("lrc-line") && lyricsData && lyricsData.isLrc) {
        const time = parseFloat(target.getAttribute("data-time"));
        
        if (player && typeof player.seekTo === "function") {
            player.seekTo(time, true);
            
            // Add visual feedback
            target.classList.add("clicked");
            setTimeout(() => {
            target.classList.remove("clicked");
            }, 300);
            
            // Update progress bar immediately
            if (player.getDuration() > 0) {
            let progressPercent = (time / player.getDuration()) * 100;
            document.getElementById("progress").style.width = progressPercent + "%";
            document.getElementById("currentTime").innerText = target.getAttribute("data-formatted-time");
            }
        }
        }
    });
}

// Initialize click-to-seek on DOM ready
document.addEventListener("DOMContentLoaded", function() {
    initLyricsClickToSeek();
});

// Modified loadLyricsFor function with translation
async function loadLyricsFor(title, artist) {
    const { artist: cleanArtist, track: cleanTrack } = cleanTitleAndArtist(title, artist);
    console.log("🎵 Cleaned song:", cleanArtist, "-", cleanTrack);

    await fetchLyricsWithTranslation(cleanTrack, cleanArtist);
    startLyricsSync();
}

async function fetchLyricsWithTranslation(title, artist) {
    // ✅ Create cache keys
    const lyricsCacheKey = `lyrics_${encodeURIComponent(artist)}_${encodeURIComponent(title)}`;
    const translationCacheKey = `translation_${encodeURIComponent(artist)}_${encodeURIComponent(title)}_${currentLang}`;

    // ✅ Check for cached lyrics first
    const cachedLyrics = localStorage.getItem(lyricsCacheKey);
    let json = null;
    let useCachedLyrics = false;

    if (cachedLyrics) {
        try {
        json = JSON.parse(cachedLyrics);
        
        // Check if it's a valid lyrics response (not a "no lyrics" cache)
        if (json.syncedLyrics || json.plainLyrics) {
            console.log("Using cached lyrics for:", artist, "-", title);
            useCachedLyrics = true;
        } else if (json.noLyrics) {
            // We've already determined no lyrics exist for this song
            console.log("No lyrics cached for:", artist, "-", title);
            throw new Error("No lyrics (cached)");
        }
        } catch (e) {
        console.warn("Failed to parse cached lyrics:", e);
        }
    }

    const meta = document.getElementById("lyricsMeta");
    const textEl = document.getElementById("lyricsText");
    const t = translations[currentLang];
    const targetLang = currentLang === 'zh' ? 'zh' : 'en';

    lyricsState = { status: "loading", artist, title };

    const tryFetch = async (artistName, trackName) => {
        const encodedArtist = encodeURIComponent(artistName);
        const encodedTrack = encodeURIComponent(trackName);
        const url = `https://lrclib.net/api/get?artist_name=${encodedArtist}&track_name=${encodedTrack}`;
        console.log("Fetching fresh lyrics from API:", url);

        // Try each proxy in order
        for (const proxy of CORS_PROXIES) {
            try {
                const proxiedUrl = `${proxy}${encodeURIComponent(url)}`;
                console.log("Trying proxy:", proxy);

                const response = await fetch(proxiedUrl, {
                    signal: AbortSignal.timeout(10000) // 10 second timeout
                });

                if (!response.ok) {
                    console.warn(`Proxy ${proxy} returned ${response.status}, trying next...`);
                    continue; // Try next proxy
                }

                const data = await response.json();
                
                // Cache the response in local storage
                if (data.syncedLyrics || data.plainLyrics) {
                    data.timestamp = Date.now();
                    localStorage.setItem(lyricsCacheKey, JSON.stringify(data));
                    console.log("Lyrics cached for:", artistName, "-", trackName);
                } else {
                    // Cache "no lyrics" result
                    const noLyricsData = { noLyrics: true, timestamp: Date.now() };
                    localStorage.setItem(lyricsCacheKey, JSON.stringify(noLyricsData));
                }
                
                return data;
            } catch (error) {
                console.warn(`Proxy ${proxy} failed:`, error.message);
                continue; // Try next proxy
            }
        }

        // If all proxies fail, throw error
        throw new Error("All lyrics proxies failed");
    };

    if (!useCachedLyrics) {
        meta.textContent = t.searching;
        textEl.textContent = t.searching;
    }

    try {
        // ✅ Fetch fresh lyrics if not cached
        if (!useCachedLyrics) {
        // Try full name first
        json = await tryFetch(artist, title);

        // If no lyrics found, try CJK-only artist
        if (!json.syncedLyrics && !json.plainLyrics) {
            const cjkOnlyArtist = artist.replace(/[\u0020A-Za-z]+/g, "").trim();
            if (cjkOnlyArtist && cjkOnlyArtist !== artist) {
            console.log("Retrying with CJK only:", cjkOnlyArtist);
            json = await tryFetch(cjkOnlyArtist, title);
            if (json.syncedLyrics || json.plainLyrics) {
                artist = cjkOnlyArtist; // Update to working version
            }
            }
        }
        }

        const lyrics = json.syncedLyrics || json.plainLyrics;
        if (!lyrics) throw new Error("No lyrics");

        const isLrc = /^\s*\[\d{1,2}:\d{2}/m.test(lyrics);
        
        // Show normal lyrics first (immediately)
        if (isLrc) {
        const parsed = parseLrc(lyrics);
        lyricsData = { isLrc: true, lrcLines: parsed };
        
        // Always show normal lyrics first
        const cacheNote = useCachedLyrics ? ` ${t.cached}` : '';
        renderLrcLines(parsed);
        meta.textContent = `${t.lyricsSyncedFound} ${artist} – ${title}${cacheNote}`;
        lyricsState.status = "synced";
        
        // Then translate in background if enabled
        if (translationEnabled && !isTranslating) {
            isTranslating = true;
            
            // Check for cached translation
            let useCachedTranslation = false;
            const cachedTranslation = localStorage.getItem(translationCacheKey);
            if (cachedTranslation) {
            try {
                const translationData = JSON.parse(cachedTranslation);
                if (translationData.translation && Date.now() - translationData.timestamp < TRANSLATION_CACHE_EXPIRY) {
                console.log("Using cached translation");
                translatedLyrics = translationData.translation;
                useCachedTranslation = true;
                showTranslatedView = true;
                }
            } catch (e) {
                console.warn("Failed to parse cached translation:", e);
            }
            }
            
            if (!useCachedTranslation) {
            // Show "translating..." message in meta
            const translateStatus = currentLang === 'zh' ? '正在翻译...' : 'Translating...';
            meta.textContent = `${t.lyricsSyncedFound} ${artist} – ${title}${cacheNote} (${translateStatus})`;
            
            // Fetch translation in background
            setTimeout(async () => {
                try {
                const sourceLang = await detectLanguage(parsed.map(l => l.text).join(' '));
                const translatedLines = await translateLyricsLines(parsed, targetLang);
                translatedLyrics = translatedLines;
                
                // Cache the translation
                localStorage.setItem(translationCacheKey, JSON.stringify({
                    translation: translatedLines,
                    timestamp: Date.now()
                }));
                
                // Update UI with translation
                const hasTranslation = translatedLyrics && 
                    translatedLyrics.some((line, i) => line !== parsed[i].text);
                
                if (hasTranslation) {
                    const translationNote = currentLang === 'zh' ? '(已翻译)' : '(Translated)';
                    renderLrcLinesWithTranslation(parsed, translatedLyrics);
                    meta.textContent = `${t.lyricsSyncedFound} ${artist} – ${title}${cacheNote} ${translationNote}`;
                    showTranslatedView = true;
                } else {
                    // No translation available, keep normal view
                    meta.textContent = `${t.lyricsSyncedFound} ${artist} – ${title}${cacheNote}`;
                }
                } catch (translationError) {
                console.error("Translation failed:", translationError);
                // Keep normal lyrics view
                meta.textContent = `${t.lyricsSyncedFound} ${artist} – ${title}${cacheNote}`;
                } finally {
                isTranslating = false;
                }
            }, 100);
            } else {
            // Use cached translation immediately
            const hasTranslation = translatedLyrics && 
                translatedLyrics.some((line, i) => line !== parsed[i].text);
            
            if (hasTranslation) {
                const translationNote = currentLang === 'zh' ? '(已翻译)' : '(Translated)';
                renderLrcLinesWithTranslation(parsed, translatedLyrics);
                meta.textContent = `${t.lyricsSyncedFound} ${artist} – ${title}${cacheNote} ${translationNote}`;
            }
            isTranslating = false;
            }
        }
        } else {
        // Plain lyrics (non-synced)
        lyricsData = { isLrc: false, plain: lyrics };
        
        // Always show normal lyrics first
        const cacheNote = useCachedLyrics ? ` ${t.cached}` : '';
        const lines = lyrics.split(/\r?\n/).filter(l => l.trim().length > 0);
        textEl.innerHTML = lines.map(line => `<div class="plain-line">${line}</div>`).join("");
        meta.textContent = `${t.lyricsPlainFound} ${artist} – ${title}${cacheNote}`;
        lyricsState.status = "plain";
        
        // Then translate in background if enabled
        if (translationEnabled && !isTranslating) {
            isTranslating = true;
            
            // Check for cached translation
            const cacheKey = `${title}-${artist}-${targetLang}-plain`;
            let useCachedTranslation = false;
            
            if (translationCache[cacheKey] && translationCache[cacheKey].translation) {
            console.log("Using cached plain translation");
            translatedLyrics = translationCache[cacheKey].translation;
            useCachedTranslation = true;
            }
            
            if (!useCachedTranslation) {
            // Show "translating..." message in meta
            const translateStatus = currentLang === 'zh' ? '正在翻译...' : 'Translating...';
            meta.textContent = `${t.lyricsPlainFound} ${artist} – ${title}${cacheNote} (${translateStatus})`;
            
            // Fetch translation in background
            setTimeout(async () => {
                try {
                const sourceLang = await detectLanguage(lyrics);
                const lines = lyrics.split(/\r?\n/);
                const translatedLines = [];
                
                for (let line of lines) {
                    if (line.trim().length === 0) {
                    translatedLines.push(line);
                    continue;
                    }
                    
                    try {
                    let translatedLine;
                    
                    if (sourceLang === 'ja' && targetLang === 'zh') {
                        // Japanese to Chinese via English
                        const englishLine = await translateSingleLine(line, sourceLang, 'en');
                        translatedLine = await translateSingleLine(englishLine, 'en', targetLang);
                    } else {
                        // Direct translation
                        translatedLine = await translateSingleLine(line, sourceLang, targetLang);
                    }
                    
                    translatedLines.push(translatedLine);
                    } catch (error) {
                    console.log(`Failed to translate line: "${line}", using original`);
                    translatedLines.push(line);
                    }
                    
                    // Small delay between lines
                    await new Promise(resolve => setTimeout(resolve, 50));
                }
                
                translatedLyrics = translatedLines.join('\n');
                
                // Cache the translation
                translationCache[cacheKey] = {
                    translation: translatedLyrics,
                    timestamp: Date.now()
                };
                localStorage.setItem('lyricsTranslationCache', JSON.stringify(translationCache));
                
                // Update UI with translation
                const hasTranslation = translatedLyrics && translatedLyrics !== lyrics;
                
                if (hasTranslation) {
                    const translationNote = currentLang === 'zh' ? '(已翻译)' : '(Translated)';
                    renderPlainLyricsWithTranslation(lyrics, translatedLyrics);
                    meta.textContent = `${t.lyricsPlainFound} ${artist} – ${title}${cacheNote} ${translationNote}`;
                    showTranslatedView = true;
                } else {
                    // No translation available, keep normal view
                    meta.textContent = `${t.lyricsPlainFound} ${artist} – ${title}${cacheNote}`;
                }
                } catch (translationError) {
                console.error("Translation failed:", translationError);
                // Keep normal lyrics view
                meta.textContent = `${t.lyricsPlainFound} ${artist} – ${title}${cacheNote}`;
                } finally {
                isTranslating = false;
                }
            }, 100);
            } else {
            // Use cached translation immediately
            const hasTranslation = translatedLyrics && translatedLyrics !== lyrics;
            
            if (hasTranslation) {
                const translationNote = currentLang === 'zh' ? '(已翻译)' : '(Translated)';
                renderPlainLyricsWithTranslation(lyrics, translatedLyrics);
                meta.textContent = `${t.lyricsPlainFound} ${artist} – ${title}${cacheNote} ${translationNote}`;
                showTranslatedView = true;
            }
            isTranslating = false;
            }
        }
        }
    } catch (e) {
        console.error("Lyrics fetch error:", e);
        lyricsData = null;
        translatedLyrics = null;
        isTranslating = false;
        
        if (e.message.includes("No lyrics")) {
            textEl.textContent = t.lyricsNotFound;
            meta.textContent = t.lyricsNotFound;
        } else {
            textEl.textContent = t.lyricsError;
            meta.textContent = t.lyricsError;
        }
        
        lyricsState.status = "error";
    }

    window.currentSongArtist = artist;
    window.currentSongTitle = title;
}

const style = document.createElement('style');
style.textContent = `
  .lrc-line {
    cursor: pointer;
    transition: background-color 0.2s, transform 0.2s;
    padding: 8px 12px;
    border-radius: 6px;
    margin: 2px 0;
  }
  
  .lrc-line:hover {
    background-color: rgba(0, 0, 0, 0.05);
    transform: scale(1.02);
  }
  
  .lrc-line.clicked {
    background-color: rgba(0, 123, 255, 0.2);
    transform: scale(1.05);
  }
  
  .original-lyric::before,
  .translated-lyric::before {
    content: attr(data-label);
    color: #888;
    font-weight: normal;
  }
  
  /* Dark mode support */
  .dark-mode .lrc-line:hover {
    background-color: rgba(255, 255, 255, 0.05);
  }
  
  .dark-mode .lrc-line.clicked {
    background-color: rgba(0, 123, 255, 0.3);
  }
  
  .dark-mode .original-lyric::before,
  .dark-mode .translated-lyric::before {
    color: #aaa;
  }
`;
document.head.appendChild(style);

// Update sync function to handle translation display
function syncLyricsToTime(currentTime) {
    if (!lyricsData || !lyricsData.isLrc) return;
    const lines = lyricsData.lrcLines;
    if (!lines || lines.length === 0) return;

    // Binary search for nearest line
    let low = 0, high = lines.length - 1, found = 0;
    while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        if (lines[mid].time <= currentTime) {
        found = mid;
        low = mid + 1;
        } else {
        high = mid - 1;
        }
    }

    const el = document.getElementById("lyricsText");
    const children = el.children;
    if (!children || children.length === 0) return;

    // Remove previous highlight
    for (let i = 0; i < children.length; i++) {
        children[i].classList.remove("highlight");
    }

    // Highlight new line
    const toHighlight = el.querySelector(`.lrc-line[data-index="${found}"]`);
    if (toHighlight) {
        toHighlight.classList.add("highlight");

        if (lyricsAutoScroll) {
        const parent = el;
        const parentRect = parent.getBoundingClientRect();
        const childRect = toHighlight.getBoundingClientRect();
        const offset = childRect.top - parentRect.top - parent.clientHeight / 2 + childRect.height / 2;
        parent.scrollBy({ top: offset, behavior: "smooth" });
        }
    }
}

function toggleTranslationOrder() {
    showOriginalFirst = !showOriginalFirst;
    
    // Re-render lyrics with new order
    if (lyricsData) {
        if (lyricsData.isLrc && lyricsData.lrcLines) {
            renderLrcLinesWithTranslation(lyricsData.lrcLines, translatedLyrics || []);
        } else if (lyricsData.plain) {
            renderPlainLyricsWithTranslation(lyricsData.plain, translatedLyrics || '');
        }
    }
}

function setTranslationOrder(order) {
    showOriginalFirst = order; // true for original first, false for translation first
    toggleTranslationOrder();
}

// Add to your settings initialization
document.getElementById("translationToggle")?.addEventListener("change", function() {
    translationEnabled = this.checked;
    localStorage.setItem("translationEnabled", JSON.stringify(translationEnabled));
    
    // Refresh lyrics if a song is currently loaded
    const title = (document.querySelector("#nowPlaying .song-title")?.innerText || "").trim();
    const artist = (document.querySelector("#nowPlaying .author-name")?.innerText || "").trim();
    if (title && lyricsData) {
        loadLyricsFor(title, artist);
    }
});

// Load translation setting on startup
translationEnabled = JSON.parse(localStorage.getItem("translationEnabled") || "false");
if (document.getElementById("translationToggle")) {
    document.getElementById("translationToggle").checked = translationEnabled;
}

document.addEventListener("DOMContentLoaded", function() {
    const translationToggle = document.getElementById("translationToggle");
    if (translationToggle) {
        translationToggle.checked = translationEnabled;
        
        translationToggle.addEventListener("change", function() {
            translationEnabled = this.checked;
            localStorage.setItem("translationEnabled", JSON.stringify(translationEnabled));
            
            // Refresh lyrics if a song is currently loaded
            const title = (document.querySelector("#nowPlaying .song-title")?.innerText || "").trim();
            const artist = (document.querySelector("#nowPlaying .author-name")?.innerText || "").trim();
            if (title && lyricsData) {
                loadLyricsFor(title, artist);
            }
        });
    }
});

// ================ CACHE MANAGER ================

let currentCacheType = 'all';
let selectedCacheItems = new Set();

// Initialize cache manager
function initCacheManager() {
    const settingsClearCacheBtn = document.getElementById('settingsClearCacheBtn');
    const cacheManagerWindow = document.getElementById('cacheManagerWindow');
    const cacheManagerOverlay = document.getElementById('cacheManagerOverlay');
    const cacheManagerCloseBtn = document.querySelector('.cache-manager-close-btn');
    const cacheCategories = document.querySelectorAll('[data-cache-type]');
    const selectAllCheckbox = document.getElementById('selectAllCache');
    const clearSelectedBtn = document.getElementById('clearSelectedCacheBtn');
    const refreshBtn = document.getElementById('refreshCacheListBtn');
    const clearAllBtn = document.getElementById('clearAllCacheBtn');
    
    // Open cache manager
    settingsClearCacheBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        openCacheManager();
    });
    
    // Close cache manager
    cacheManagerCloseBtn.addEventListener('click', closeCacheManager);
    cacheManagerOverlay.addEventListener('click', closeCacheManager);
    
    // Escape key
    document.addEventListener('keydown', function(event) {
        if (event.key === 'Escape' && cacheManagerWindow.classList.contains('show')) {
            closeCacheDetails();
            closeCacheManager();
        }
    });
    
    // Category filtering
    cacheCategories.forEach(btn => {
        btn.addEventListener('click', function() {
            cacheCategories.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            currentCacheType = this.getAttribute('data-cache-type');
            loadCacheList();
        });
    });
    
    // Select all
    selectAllCheckbox.addEventListener('change', function() {
        const checkboxes = document.querySelectorAll('.cache-item-checkbox');
        selectedCacheItems.clear();
        
        checkboxes.forEach(checkbox => {
            checkbox.checked = this.checked;
            const key = checkbox.getAttribute('data-key');
            const item = checkbox.closest('.cache-item');
            
            if (this.checked) {
                selectedCacheItems.add(key);
                if (item) item.classList.add('selected');
            } else {
                if (item) item.classList.remove('selected');
            }
        });
        
        updateSelectAllCheckbox();
    });
    
    // Clear selected
    clearSelectedBtn.addEventListener('click', function() {
        if (selectedCacheItems.size === 0) {
            alert(translations[currentLang].noItemsSelected || 'No items selected');
            return;
        }
        
        // Get the translation string and replace the placeholder
        const confirmMessage = (translations[currentLang].confirmDeleteSelected || 'Delete {count} selected item(s)?')
            .replace('{count}', selectedCacheItems.size);
        
        if (confirm(confirmMessage)) {
            deleteCacheItems(Array.from(selectedCacheItems));
        }
    });
    
    // Refresh
    refreshBtn.addEventListener('click', loadCacheList);
    
    // Clear all
    clearAllBtn.addEventListener('click', function() {
        if (confirm(translations[currentLang].confirmClearAllCache || 'Are you sure you want to clear ALL cache? This cannot be undone.')) {
            clearAllCache();
        }
    });
    
    // Details modal close
    const detailsCloseBtns = document.querySelectorAll('.cache-details-close-btn');
    detailsCloseBtns.forEach(btn => {
        btn.addEventListener('click', closeCacheDetails);
    });
    
    // Delete from details
    document.getElementById('deleteFromDetailsBtn').addEventListener('click', function() {
        const cacheKey = this.getAttribute('data-cache-key');
        if (cacheKey) {
            deleteCacheItems([cacheKey]);
            closeCacheDetails();
        }
    });
    
    // Copy content
    document.getElementById('copyContentBtn').addEventListener('click', function() {
        const content = document.getElementById('detailCacheContent').textContent;
        navigator.clipboard.writeText(content).then(() => {
            alert(translations[currentLang].copiedToClipboard || 'Copied to clipboard!');
        });
    });
}

// Open cache manager
function openCacheManager() {
    const cacheManagerWindow = document.getElementById('cacheManagerWindow');
    const cacheManagerOverlay = document.getElementById('cacheManagerOverlay');
    
    cacheManagerWindow.classList.add('show');
    cacheManagerOverlay.classList.add('show');
    document.body.style.overflow = 'hidden';
    
    loadCacheList();
}

// Close cache manager
function closeCacheManager() {
    const cacheManagerWindow = document.getElementById('cacheManagerWindow');
    const cacheManagerOverlay = document.getElementById('cacheManagerOverlay');

    closeCacheDetails();
    
    cacheManagerWindow.classList.remove('show');
    cacheManagerOverlay.classList.remove('show');
    document.body.style.overflow = '';
    
    // Clear selection
    selectedCacheItems.clear();
}

// Load cache list
function loadCacheList() {
    const cacheList = document.getElementById('cacheList');
    const totalItemsSpan = document.getElementById('totalCacheItems');
    const totalSizeSpan = document.getElementById('totalCacheSize');
    
    let cacheItems = [];
    let totalSize = 0;
    
    // Collect all cache items from localStorage
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        let type = 'unknown';
        
        // Determine cache type
        if (key.startsWith('lyrics_')) {
            type = 'lyrics';
        } else if (key.startsWith('ytSearchCache') || key === 'ytSearchCache') {
            type = 'search';
        } else if (key.startsWith('translation_') || key === 'lyricsTranslationCache') {
            type = 'translation';
        } else {
            continue; // Skip non-cache items
        }
        
        // Filter by current type
        if (currentCacheType !== 'all' && type !== currentCacheType) {
            continue;
        }
        
        try {
            const value = localStorage.getItem(key);
            const size = new Blob([value]).size;
            totalSize += size;
            
            cacheItems.push({
                key: key,
                type: type,
                size: size,
                timestamp: getCacheTimestamp(key, value),
                value: value
            });
        } catch (e) {
            console.warn('Error reading cache item:', e);
        }
    }
    
    // Sort by timestamp (newest first)
    cacheItems.sort((a, b) => b.timestamp - a.timestamp);
    
    // Update stats
    totalItemsSpan.textContent = cacheItems.length;
    totalSizeSpan.textContent = formatBytes(totalSize);
    
    // Render list
    renderCacheList(cacheItems);
    
    // Clear selection
    selectedCacheItems.clear();
    document.getElementById('selectAllCache').checked = false;
}

// Render cache list
function renderCacheList(items) {
    const cacheList = document.getElementById('cacheList');
    const t = translations[currentLang];
    
    if (items.length === 0) {
        cacheList.innerHTML = `
            <div class="empty-cache-list">
                <i class='bx bx-folder-open'></i>
                <p>${t.noCacheItems || 'No cache items found'}</p>
            </div>
        `;
        return;
    }
    
    cacheList.innerHTML = items.map(item => {
        // Check if this item is already selected
        const isSelected = selectedCacheItems.has(item.key);
        
        return `
        <div class="cache-item ${isSelected ? 'selected' : ''}" data-cache-key="${item.key}" data-cache-type="${item.type}">
            <div class="cache-checkbox">
                <input type="checkbox" class="form-check-input cache-item-checkbox" data-key="${item.key}" ${isSelected ? 'checked' : ''}>
            </div>
            <div class="cache-key" title="${item.key}">${item.key}</div>
            <div class="cache-type">
                <span class="cache-type-badge ${item.type}">${getCacheTypeLabel(item.type)}</span>
            </div>
            <div class="cache-size">${formatBytes(item.size)}</div>
            <div class="cache-age">${formatCacheAge(item.timestamp)}</div>
            <div class="cache-item-actions">
                <button class="btn btn-sm btn-info view-cache-btn" data-key="${item.key}" title="${t.viewDetails || 'View Details'}">
                    <i class='bx bx-show'></i>
                </button>
                <button class="btn btn-sm btn-danger delete-cache-btn" data-key="${item.key}" title="${t.delete || 'Delete'}">
                    <i class='bx bx-trash'></i>
                </button>
            </div>
        </div>
    `}).join('');
    
    // Add event listeners to checkboxes
    document.querySelectorAll('.cache-item-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', function(e) {
            const key = this.getAttribute('data-key');
            const item = this.closest('.cache-item');
            
            if (this.checked) {
                selectedCacheItems.add(key);
                if (item) item.classList.add('selected');
            } else {
                selectedCacheItems.delete(key);
                if (item) item.classList.remove('selected');
            }
            
            updateSelectAllCheckbox();
        });
    });
    
    // Add click event to the whole cache item (but not when clicking on buttons or checkbox)
    document.querySelectorAll('.cache-item').forEach(item => {
        item.addEventListener('click', function(e) {
            // Don't trigger if clicking on checkbox, view button, or delete button
            if (e.target.closest('.cache-item-checkbox') || 
                e.target.closest('.view-cache-btn') || 
                e.target.closest('.delete-cache-btn')) {
                return;
            }
            
            const checkbox = this.querySelector('.cache-item-checkbox');
            if (checkbox) {
                checkbox.checked = !checkbox.checked;
                // Trigger change event
                const event = new Event('change', { bubbles: true });
                checkbox.dispatchEvent(event);
            }
        });
    });
    
    document.querySelectorAll('.view-cache-btn').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            const key = this.getAttribute('data-key');
            viewCacheItem(key);
        });
    });
    
    document.querySelectorAll('.delete-cache-btn').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.stopPropagation();
            const key = this.getAttribute('data-key');
            if (confirm(translations[currentLang].confirmDeleteItem || 'Delete this cache item?')) {
                deleteCacheItems([key]);
            }
        });
    });
    
    // Update select all checkbox state
    updateSelectAllCheckbox();
}

// Handle cache item checkbox
function handleCacheItemCheckbox(e) {
    const key = e.target.getAttribute('data-key');
    const item = e.target.closest('.cache-item');
    
    if (e.target.checked) {
        selectedCacheItems.add(key);
        if (item) item.classList.add('selected');
    } else {
        selectedCacheItems.delete(key);
        if (item) item.classList.remove('selected');
    }
    
    updateSelectAllCheckbox();
}

// Update select all checkbox
function updateSelectAllCheckbox() {
    const selectAll = document.getElementById('selectAllCache');
    const checkboxes = document.querySelectorAll('.cache-item-checkbox');
    const checkedBoxes = document.querySelectorAll('.cache-item-checkbox:checked');
    
    if (!selectAll) return;
    
    if (checkboxes.length === 0) {
        selectAll.checked = false;
        selectAll.indeterminate = false;
        return;
    }
    
    if (checkedBoxes.length === checkboxes.length) {
        selectAll.checked = true;
        selectAll.indeterminate = false;
    } else if (checkedBoxes.length === 0) {
        selectAll.checked = false;
        selectAll.indeterminate = false;
    } else {
        selectAll.checked = false;
        selectAll.indeterminate = true;
    }
}

// Delete cache items
function deleteCacheItems(keys) {
    keys.forEach(key => {
        localStorage.removeItem(key);
        
        // Also remove from in-memory caches
        if (key === 'ytSearchCache') {
            Object.keys(searchCache).forEach(k => delete searchCache[k]);
        } else if (key === 'lyricsTranslationCache') {
            Object.keys(translationCache).forEach(k => delete translationCache[k]);
        } else if (key.startsWith('lyrics_')) {
            // Also remove expiry
            localStorage.removeItem(`${key}_expiry`);
        }
    });
    
    // Clear selection
    selectedCacheItems.clear();
    
    // Reload list
    loadCacheList();
}

// Clear all cache
function clearAllCache() {
    const keysToRemove = [];
    
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key.startsWith('lyrics_') || 
            key.startsWith('ytSearchCache') || 
            key === 'ytSearchCache' ||
            key.startsWith('translation_') || 
            key === 'lyricsTranslationCache') {
            keysToRemove.push(key);
        }
    }
    
    keysToRemove.forEach(key => localStorage.removeItem(key));
    
    // Clear in-memory caches
    Object.keys(searchCache).forEach(k => delete searchCache[k]);
    Object.keys(translationCache).forEach(k => delete translationCache[k]);
    
    // Clear selection
    selectedCacheItems.clear();
    
    // Reload list
    loadCacheList();
}

// View cache item details
function viewCacheItem(key) {
    const modal = document.getElementById('cacheItemDetailsModal');
    const value = localStorage.getItem(key);
    const type = getCacheTypeFromKey(key);
    const size = new Blob([value]).size;
    const timestamp = getCacheTimestamp(key, value);
    
    document.getElementById('detailCacheKey').textContent = key;
    document.getElementById('detailCacheType').textContent = getCacheTypeLabel(type);
    document.getElementById('detailCacheSize').textContent = formatBytes(size);
    document.getElementById('detailCacheAge').textContent = formatCacheAge(timestamp);
    
    // Format content for display
    let content = value;
    try {
        // Try to pretty print JSON
        const parsed = JSON.parse(value);
        content = JSON.stringify(parsed, null, 2);
    } catch (e) {
        // Not JSON, keep as is
    }
    document.getElementById('detailCacheContent').textContent = content;
    
    // Set delete button data
    document.getElementById('deleteFromDetailsBtn').setAttribute('data-cache-key', key);
    
    modal.classList.add('show');
}

// Close cache details
function closeCacheDetails() {
    const modal = document.getElementById('cacheItemDetailsModal');
    if (modal) {
        modal.classList.remove('show');
    }
}

// Get cache type from key
function getCacheTypeFromKey(key) {
    if (key.startsWith('lyrics_')) return 'lyrics';
    if (key.startsWith('ytSearchCache') || key === 'ytSearchCache') return 'search';
    if (key.startsWith('translation_') || key === 'lyricsTranslationCache') return 'translation';
    return 'unknown';
}

// Get cache type label
function getCacheTypeLabel(type) {
    const t = translations[currentLang];
    switch(type) {
        case 'search': return t.searchCache || 'Search';
        case 'lyrics': return t.lyricsCache || 'Lyrics';
        case 'translation': return t.translationCache || 'Translation';
        default: return t.unknown || 'Unknown';
    }
}

// Get cache timestamp
function getCacheTimestamp(key, value) {
    // Try to extract timestamp from cache data
    try {
        const parsed = JSON.parse(value);

        if (key === 'ytSearchCache') {
            // Find the most recent timestamp among all search terms
            let newestTimestamp = 0;
            let hasValidTimestamp = false;
            
            // Loop through each search term in the cache
            for (const searchTerm in parsed) {
                if (parsed[searchTerm] && parsed[searchTerm].timestamp) {
                    const termTimestamp = parsed[searchTerm].timestamp;
                    if (termTimestamp > newestTimestamp) {
                        newestTimestamp = termTimestamp;
                    }
                    hasValidTimestamp = true;
                }
            }
            
            if (hasValidTimestamp) {
                return newestTimestamp;
            }
        }

        if (key === 'lyricsTranslationCache') {
            // Find the most recent timestamp among all translation entries
            let newestTimestamp = 0;
            let hasValidTimestamp = false;
            
            // Loop through each translation entry in the cache
            for (const translationKey in parsed) {
                if (parsed[translationKey] && parsed[translationKey].timestamp) {
                    const entryTimestamp = parsed[translationKey].timestamp;
                    if (entryTimestamp > newestTimestamp) {
                        newestTimestamp = entryTimestamp;
                    }
                    hasValidTimestamp = true;
                }
            }
            
            if (hasValidTimestamp) {
                return newestTimestamp;
            }
        }

        if (parsed.timestamp) {
            return parsed.timestamp;
        }
    } catch (e) {
        // Not JSON or no timestamp
    }
    
    // Check for expiry key
    const expiryKey = `${key}_expiry`;
    const expiry = localStorage.getItem(expiryKey);
    if (expiry) {
        return parseInt(expiry) - (7 * 24 * 60 * 60 * 1000); // Approximate creation time
    }
    
    // Fallback to current time minus 1 hour
    return Date.now();
}

// Format bytes
function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Format cache age
function formatCacheAge(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'Just now';
}

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', function() {
    initCacheManager();
});