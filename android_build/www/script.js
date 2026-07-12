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
let repeatSong = localStorage.getItem("repeatSong") === "true";
let autoPlayEnabled = localStorage.getItem("autoPlay") !== "false";

// Lyrics performance settings.
// false = do not fetch/translate while the Playlist page is open.
let allowLyricsFetchWhenHidden =
    localStorage.getItem("allowLyricsFetchWhenHidden") === "true";

let allowLyricsTranslationWhenHidden =
    localStorage.getItem("allowLyricsTranslationWhenHidden") === "true";

// Cancels old fetches/translations and blocks stale results from changing the UI.
let lyricsRequestVersion = 0;
let translationRequestVersion = 0;
let lyricsFetchController = null;
let lyricsTranslationController = null;

// YOUTUBE_API_KEY is now loaded from "YOUR_YOUTUBE_API_KEY", Vercel API endpoint or Cloudflare Worker endpoint
const YOUTUBE_API_KEY = "YOUR_YOUTUBE_API_KEY";
const VERCEL_API_KEY_ENDPOINT = "/api/getApiKey";

let cachedApiKey = null;

async function getApiKey() {
    if (cachedApiKey) {
        return cachedApiKey;
    }

    // 1. Try direct injected key first
    if (
        typeof YOUTUBE_API_KEY !== "undefined" &&
        YOUTUBE_API_KEY &&
        YOUTUBE_API_KEY !== "YOUR_YOUTUBE_API_KEY" &&
        YOUTUBE_API_KEY.length > 10
    ) {
        cachedApiKey = YOUTUBE_API_KEY;
        console.log("Using injected YouTube API key.");
        return cachedApiKey;
    }

    // 2. Try Vercel / local API endpoint
    try {
        console.log("Trying Vercel/local API key endpoint:", VERCEL_API_KEY_ENDPOINT);

        const response = await fetch(VERCEL_API_KEY_ENDPOINT, {
            method: "GET",
            cache: "no-store"
        });

        if (response.ok) {
            const data = await response.json();

            if (
                data &&
                data.apiKey &&
                data.apiKey !== "YOUR_YOUTUBE_API_KEY" &&
                data.apiKey.length > 10
            ) {
                cachedApiKey = data.apiKey;
                console.log("Using API key from Vercel/local endpoint.");
                return cachedApiKey;
            }
        } else {
            console.warn("Vercel/local API key endpoint failed:", response.status);
        }
    } catch (error) {
        console.warn("Vercel/local API key endpoint error:", error);
    }

    // 3. Last fallback: try Cloudflare Worker endpoint
    const CLOUDFLARE_API_KEY_ENDPOINT =
        "https://get-api-key.jacobng9022.workers.dev/getApiKey";

    try {
        console.log("Trying Cloudflare API key endpoint:", CLOUDFLARE_API_KEY_ENDPOINT);

        const response = await fetch(CLOUDFLARE_API_KEY_ENDPOINT, {
            method: "GET",
            cache: "no-store"
        });

        if (response.ok) {
            const data = await response.json();

            if (
                data &&
                data.apiKey &&
                data.apiKey !== "YOUR_YOUTUBE_API_KEY" &&
                data.apiKey.length > 10
            ) {
                cachedApiKey = data.apiKey;
                console.log("Using API key from Cloudflare endpoint.");
                return cachedApiKey;
            }
        } else {
            console.warn("Cloudflare API key endpoint failed:", response.status);
        }
    } catch (error) {
        console.warn("Cloudflare API key endpoint error:", error);
    }

    throw new Error("No valid YouTube API key found.");
}

function isLyricsPageVisible() {
    const lyricsContainer = document.getElementById("lyricsContainer");

    return Boolean(
        lyricsContainer &&
        !lyricsContainer.classList.contains("d-none")
    );
}

function shouldFetchLyricsNow(force = false) {
    return force || isLyricsPageVisible() || allowLyricsFetchWhenHidden;
}

function shouldTranslateLyricsNow() {
    return (
        translationEnabled &&
        (isLyricsPageVisible() || allowLyricsTranslationWhenHidden)
    );
}

function isAbortError(error) {
    return error?.name === "AbortError";
}

function throwIfLyricsAborted(signal) {
    if (signal?.aborted) {
        throw new DOMException("Lyrics task cancelled.", "AbortError");
    }
}

function delayWithSignal(milliseconds, signal) {
    return new Promise((resolve, reject) => {
        if (signal?.aborted) {
            reject(new DOMException("Lyrics task cancelled.", "AbortError"));
            return;
        }

        const timer = setTimeout(resolve, milliseconds);

        signal?.addEventListener(
            "abort",
            () => {
                clearTimeout(timer);
                reject(new DOMException("Lyrics task cancelled.", "AbortError"));
            },
            { once: true }
        );
    });
}

function cancelActiveTranslation() {
    translationRequestVersion += 1;

    if (lyricsTranslationController) {
        lyricsTranslationController.abort();
        lyricsTranslationController = null;
    }

    isTranslating = false;
}

function stopLyricsJobs({ clearLyrics = false } = {}) {
    lyricsRequestVersion += 1;

    if (lyricsFetchController) {
        lyricsFetchController.abort();
        lyricsFetchController = null;
    }

    cancelActiveTranslation();
    clearInterval(syncInterval);

    if (clearLyrics) {
        lyricsData = null;
        translatedLyrics = null;
        showTranslatedView = false;

        lyricsState = {
            status: "idle",
            artist: "",
            title: "",
            videoId: ""
        };

        if (isLyricsPageVisible()) {
            document.getElementById("lyricsMeta").textContent =
                translations[currentLang].lyricsNoLoad;

            document.getElementById("lyricsText").textContent =
                translations[currentLang].lyricsNoLoad;
        }
    }
}

function isCurrentLyricsJob(job) {
    const currentVideoId = actualSelectedVideoId || selectedVideoId;

    return Boolean(
        job &&
        !job.signal.aborted &&
        job.version === lyricsRequestVersion &&
        job.videoId === currentVideoId
    );
}

function requestLyricsForCurrentSong({ force = false } = {}) {
    const currentSong = getCurrentSongObject();

    if (!currentSong || !isLyricsPageVisible()) {
        return;
    }

    loadLyricsFor(
        currentSong.songName,
        currentSong.authorName,
        {
            force,
            videoId: currentSong.videoId
        }
    );
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

function cleanSongTitle(title, author) {
    if (!title) return '';
    let cleaned = title.trim();
    if (!author) return cleaned;

    // Escape special regex characters in author
    const escapedAuthor = author.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Remove "Author - " at start
    cleaned = cleaned.replace(new RegExp(`^${escapedAuthor}\\s*[-–—]\\s*`), '');
    // Remove " - Author" at end
    cleaned = cleaned.replace(new RegExp(`\\s*[-–—]\\s*${escapedAuthor}$`), '');

    return cleaned;
}

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
        if (!allowLyricsFetchWhenHidden && typeof stopLyricsJobs === "function") {
            stopLyricsJobs();
        }
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
        requestLyricsForCurrentSong({ force: true });
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
            { videoId: 'oWRCXGvcU9s', songName: '愛くださいませ', authorName: 'NOT EQUAL ME', albumArt: 'https://i.ytimg.com/vi/oWRCXGvcU9s/hqdefault.jpg' },
            { videoId: 'IBWxJxQxSHE', songName: '≠ME', authorName: 'NOT EQUAL ME', albumArt: 'https://i.ytimg.com/vi/IBWxJxQxSHE/hqdefault.jpg', lyricsTimeOffset: -3.0 },
            { videoId: 'bi__z02xRgo', songName: 'チョコレートメランコリー', authorName: 'NOT EQUAL ME', albumArt: 'https://i.ytimg.com/vi/bi__z02xRgo/hqdefault.jpg' },
            { videoId: '2RdTOBmz6jY', songName: '排他的ファイター', authorName: 'NOT EQUAL ME', albumArt: 'https://i.ytimg.com/vi/2RdTOBmz6jY/hqdefault.jpg', lyricsTimeOffset: -5.5 },
            { videoId: 'TQ8WlA2GXbk', songName: 'Official髭男dism - Pretender［Official Video］', authorName: 'Official髭男dism', albumArt: 'https://i.ytimg.com/vi/TQ8WlA2GXbk/hqdefault.jpg' },
            { videoId: '0sDmhAItwbI', songName: 'Official髭男dism - Pretender (Acoustic ver.)［Official Video］', authorName: 'Official髭男dism', albumArt: 'https://i.ytimg.com/vi/0sDmhAItwbI/hqdefault.jpg', lyricsTimeOffset: 17.5 },
            { videoId: '22mOCjkwQjM', songName: 'Official髭男dism - Stand By You［Official Video］', authorName: 'Official髭男dism', albumArt: 'https://i.ytimg.com/vi/22mOCjkwQjM/hqdefault.jpg', lyricsTimeOffset: -2.0 },
            { videoId: '1oYzKnVG1Vk', songName: 'Official髭男dism - Stand By You (Acoustic ver.)［Official Video］', authorName: 'Official髭男dism', albumArt: 'https://i.ytimg.com/vi/1oYzKnVG1Vk/hqdefault.jpg', lyricsTimeOffset: -2.0 },
            { videoId: 'pkoxFpmiCWo', songName: 'Official髭男dism - パラボラ［Official Video］', authorName: 'Official髭男dism', albumArt: 'https://i.ytimg.com/vi/pkoxFpmiCWo/hqdefault.jpg' },
            { videoId: 'ArjJj4cuOVo', songName: 'Laughter (ONLINE LIVE 2020 - Arena Travelers -)', authorName: 'OFFICIAL HIGE DANDISM - Topic', albumArt: 'https://i.ytimg.com/vi/ArjJj4cuOVo/hqdefault.jpg' },
            { videoId: 'cqzyiJE4SQE', songName: '笑顔の待つ場所', authorName: 'Official髭男dism', albumArt: 'https://i.ytimg.com/vi/cqzyiJE4SQE/hqdefault.jpg' },
            { videoId: 'P1iOKxg6JQk', songName: '明け方のゲッタウェイ (Live)', authorName: 'Official髭男dism', albumArt: 'https://i.ytimg.com/vi/P1iOKxg6JQk/hqdefault.jpg' },
            { videoId: '86uTlHDIbAw', songName: 'ダッフルコートノアマイユメ_オリジナル', authorName: 'Satoshi Fujihara', albumArt: 'https://i.ytimg.com/vi/86uTlHDIbAw/hqdefault.jpg' },
            { videoId: 'sPAJ6mTxNCU', songName: 'ふりだす雨、ゴキゲンな君', authorName: 'Official髭男dism', albumArt: 'https://i.ytimg.com/vi/sPAJ6mTxNCU/hqdefault.jpg' },
            { videoId: 'DuMqFknYHBs', songName: 'Official髭男dism - イエスタデイ［Official Video］', authorName: 'Official髭男dism', albumArt: 'https://i.ytimg.com/vi/DuMqFknYHBs/hqdefault.jpg' },
            { videoId: 'aRtoPwe4ado', songName: 'Sanitizer', authorName: 'OFFICIAL HIGE DANDISM - Topic', albumArt: 'https://i.ytimg.com/vi/aRtoPwe4ado/hqdefault.jpg' },
            { videoId: 'l2nqfPAMrSo', songName: 'Chessboard', authorName: 'OFFICIAL HIGE DANDISM - Topic', albumArt: 'https://i.ytimg.com/vi/l2nqfPAMrSo/hqdefault.jpg' },
            { videoId: 'cqzyiJE4SQE', songName: '笑顔の待つ場所', authorName: 'Official髭男dism', albumArt: 'https://i.ytimg.com/vi/cqzyiJE4SQE/hqdefault.jpg' },
            { videoId: 'ajJKtzg--5g', songName: 'ラストソング［Studio Live Session］', authorName: 'Official髭男dism', albumArt: 'https://i.ytimg.com/vi/ajJKtzg--5g/hqdefault.jpg', lyricsTimeOffset: -9.0 },
        ];
    }
    renderPlaylist(playlist);
}

const MAX_LYRICS_TIME_OFFSET_SECONDS = 30;

function getCurrentSongObject() {
    const currentVideoId = actualSelectedVideoId || selectedVideoId;

    if (!currentVideoId) return null;

    return playlist.find(song => song.videoId === currentVideoId) || null;
}

function setCurrentSongLyricsTimeOffset(seconds) {
    const song = getCurrentSongObject();
    const offset = Number(seconds);

    if (!song || !Number.isFinite(offset)) return false;

    song.lyricsTimeOffset = Math.max(
        -MAX_LYRICS_TIME_OFFSET_SECONDS,
        Math.min(MAX_LYRICS_TIME_OFFSET_SECONDS, offset)
    );

    // Saves the updated song object to localStorage.
    savePlaylist();
    return true;
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
        
        const cleanSongName = cleanSongTitle(song.songName, song.authorName);
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
                
                updateSongTitle(firstSongObj.songName);
                updateAuthorName(firstSongObj.authorName);
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
            updateSongTitle("No Song");
            updateAuthorName("");
            document.getElementById("progress").style.width = "0%";
            document.getElementById("currentTime").innerText = "0:00";
            document.getElementById("totalTime").innerText = "-0:00";
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
    console.log("API Key present (from 'YOUR_YOUTUBE_API_KEY'): ", typeof apiKey !== 'undefined' && apiKey.length > 10);

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

    // Add to playlist
    const newSong = { videoId, songName: title, authorName: author, albumArt, lyricsTimeOffset: 0};
    playlist.push(newSong);
    savePlaylist();
    renderPlaylist(playlist);

    alert(t.addedSong(title, author));

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

    const newSong = { videoId, songName: songTitle, authorName, albumArt, lyricsTimeOffset: 0};
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

const savedVolumeValue = localStorage.getItem("volumeLevel");
const savedVolume = Number(savedVolumeValue);

let currentVolume = savedVolumeValue !== null && Number.isFinite(savedVolume) ? Math.min(100, Math.max(0, savedVolume)) : 100;

    function clampVolume(value) {
    const numericValue = Number(value);

    if (!Number.isFinite(numericValue)) {
        return 100;
    }

    return Math.round(Math.min(100, Math.max(0, numericValue)));
}

function updateVolumeUI(volumeValue) {
    const value = clampVolume(volumeValue);

    const volumeControl = document.getElementById("volumeControl");
    const volumeBarContainer = document.querySelector(".volume-bar-container");
    const volumeProgress = document.getElementById("volumeProgress");
    const volumeThumb = document.getElementById("volumeThumb");
    const volumeValueOutput = document.getElementById("volumeValue");

    if (volumeControl) {
        volumeControl.value = value;
        volumeControl.setAttribute("aria-valuenow", String(value));
        volumeControl.setAttribute("aria-valuetext", `${value}%`);
    }

    if (volumeBarContainer) {
        volumeBarContainer.setAttribute("aria-valuenow", String(value));
        volumeBarContainer.setAttribute("aria-valuetext", `${value}%`);
    }

    if (volumeProgress) {
        volumeProgress.style.width = `${value}%`;
    }

    if (volumeThumb) {
        volumeThumb.style.left = `${value}%`;
    }

    if (volumeValueOutput) {
        volumeValueOutput.value = `${value}%`;
        volumeValueOutput.textContent = `${value}%`;
    }
}

function setVolume(value, saveToStorage = true) {
    currentVolume = clampVolume(value);

    if (saveToStorage) {
        localStorage.setItem("volumeLevel", String(currentVolume));
    }

    if (player && typeof player.setVolume === "function") {
        player.setVolume(currentVolume);
    }

    updateVolumeUI(currentVolume);
}

function initVolumeControls() {
    const volumeControl = document.getElementById("volumeControl");
    const volumeBarContainer = document.querySelector(".volume-bar-container");

    if (!volumeControl || !volumeBarContainer) {
        return;
    }

    // Do not let the hidden range input receive touch/mouse dragging.
    // The outer bar controls the drag position consistently.
    volumeControl.tabIndex = -1;
    volumeControl.setAttribute("aria-hidden", "true");

    volumeBarContainer.tabIndex = 0;
    volumeBarContainer.setAttribute("role", "slider");
    volumeBarContainer.setAttribute("aria-label", "Player volume");
    volumeBarContainer.setAttribute("aria-valuemin", "0");
    volumeBarContainer.setAttribute("aria-valuemax", "100");

    let activePointerId = null;

    function setVolumeFromPointer(event) {
        const rect = volumeBarContainer.getBoundingClientRect();

        if (rect.width <= 0) {
            return;
        }

        const percentage = ((event.clientX - rect.left) / rect.width) * 100;
        setVolume(percentage);
    }

    function finishPointerDrag(event) {
        if (activePointerId !== event.pointerId) {
            return;
        }

        if (volumeBarContainer.hasPointerCapture?.(event.pointerId)) {
            volumeBarContainer.releasePointerCapture(event.pointerId);
        }

        activePointerId = null;
        volumeBarContainer.classList.remove("is-dragging");
    }

    volumeBarContainer.addEventListener("pointerdown", (event) => {
        if (event.pointerType === "mouse" && event.button !== 0) {
            return;
        }

        event.preventDefault();

        activePointerId = event.pointerId;
        volumeBarContainer.classList.add("is-dragging");

        if (volumeBarContainer.setPointerCapture) {
            volumeBarContainer.setPointerCapture(event.pointerId);
        }

        setVolumeFromPointer(event);

        try {
            volumeBarContainer.focus({ preventScroll: true });
        } catch {
            volumeBarContainer.focus();
        }
    });

    volumeBarContainer.addEventListener("pointermove", (event) => {
        if (activePointerId !== event.pointerId) {
            return;
        }

        event.preventDefault();
        setVolumeFromPointer(event);
    });

    volumeBarContainer.addEventListener("pointerup", finishPointerDrag);
    volumeBarContainer.addEventListener("pointercancel", finishPointerDrag);

    volumeBarContainer.addEventListener("lostpointercapture", () => {
        activePointerId = null;
        volumeBarContainer.classList.remove("is-dragging");
    });

    // Keyboard accessibility.
    volumeBarContainer.addEventListener("keydown", (event) => {
        const step = event.shiftKey ? 5 : 1;

        switch (event.key) {
            case "ArrowRight":
            case "ArrowUp":
                event.preventDefault();
                setVolume(currentVolume + step);
                break;

            case "ArrowLeft":
            case "ArrowDown":
                event.preventDefault();
                setVolume(currentVolume - step);
                break;

            case "PageUp":
                event.preventDefault();
                setVolume(currentVolume + 10);
                break;

            case "PageDown":
                event.preventDefault();
                setVolume(currentVolume - 10);
                break;

            case "Home":
                event.preventDefault();
                setVolume(0);
                break;

            case "End":
                event.preventDefault();
                setVolume(100);
                break;
        }
    });

    volumeBarContainer.addEventListener(
        "wheel",
        (event) => {
            const desktopPointer = window.matchMedia(
                "(hover: hover) and (pointer: fine)"
            ).matches;

            if (!desktopPointer) {
                return;
            }

            event.preventDefault();
            setVolume(currentVolume + (event.deltaY < 0 ? 5 : -5));
        },
        { passive: false }
    );

    updateVolumeUI(currentVolume);
}

document.addEventListener("DOMContentLoaded", initVolumeControls);

// Create exactly one YouTube iframe player. It remains the audio source in
// Spin/None mode and becomes the visible video in Video mode.
function createMainYouTubePlayer(videoId, autoplay = false) {
    const videoContainer = document.getElementById("videoPlayerInAlbumArt");
    if (!videoContainer || !window.YT || !YT.Player) return null;

    if (!document.getElementById("player")) {
        videoContainer.innerHTML = '<div id="player"></div>';
    }

    player = new YT.Player('player', {
        videoId,
        playerVars: {
            autoplay: autoplay ? 1 : 0,
            controls: 0,
            modestbranding: 1,
            showinfo: 0,
            rel: 0,
            fs: 0,
            iv_load_policy: 3,
            playsinline: 1,
            start: 0
        },
        events: {
            'onReady': (event) => {
                event.target.setVolume(currentVolume);
                updateVolumeUI(currentVolume);

                if (autoplay) {
                    event.target.playVideo();
                }

                if (albumArtDisplayMode === "video") {
                    initializeVideoPlayerInAlbumArt();
                }
            },
            'onStateChange': handlePlayerStateChange,
            'onError': handleVideoError
        }
    });

    return player;
}

// Make onYouTubeIframeAPIReady globally accessible.
window.onYouTubeIframeAPIReady = function() {
    if (!window.YT || !YT.Player) return;
    if (player && typeof player.loadVideoById === "function") return;

    console.log("YouTube IFrame API is ready!");
    const initialVideoId = actualSelectedVideoId || selectedVideoId ||
        (playlist.length > 0 ? playlist[0].videoId : "");

    if (initialVideoId) {
        selectedVideoId = initialVideoId;
        createMainYouTubePlayer(initialVideoId, false);
    }
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

// Attach reset function to song change event
document.getElementById("songList").addEventListener("click", resetErrorState); // Example event listener

function loadNewVideo(videoId, albumArtUrl, songObject = null) {
    selectedVideoId = videoId;
    actualSelectedVideoId = videoId;

    stopLyricsJobs({ clearLyrics: true });

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
        let originalSongName = songObject.songName;
        let authorName = songObject.authorName;
        let cleanSongName = cleanSongTitle(originalSongName, authorName);

        if (cleanSongName !== lastSong) {
            songTitleElem.style.transition = "opacity 0.5s ease-in-out";
            songTitleElem.style.opacity = "0";
            setTimeout(() => {
                updateSongTitle(cleanSongName);
                songTitleElem.style.opacity = "1";
            }, 500);
            lastSong = cleanSongName;
        }
        
        if (authorName !== lastAuthor) {
            authorNameElem.style.transition = "opacity 0.5s ease-in-out";
            authorNameElem.style.opacity = "0";
            setTimeout(() => {
                updateAuthorName(authorName);
                authorNameElem.style.opacity = "1";
            }, 500);
            lastAuthor = authorName;
        }

        // Load lyrics using original (uncleaned) title and author
        loadLyricsFor(originalSongName, authorName, { videoId });
    }

    clearTimeout(errorTimeout);
    document.getElementById("errorMessage").style.display = "none";
    songUnavailable = false;

    // ✅ Reset countdown interval if switching songs
    clearInterval(countdownInterval);

    // Load and play the new video through the single main iframe player.
    if (!player || typeof player.loadVideoById !== "function") {
        selectedVideoId = videoId;

        if (window.YT && window.YT.Player) {
            createMainYouTubePlayer(videoId, true);
        } else {
            // The iframe API callback will use selectedVideoId once it is ready.
            console.warn("YouTube IFrame API is not ready yet; the selected song will load when it is available.");
        }
    } else {
        player.loadVideoById(videoId);
        player.setVolume(currentVolume);
        player.playVideo();
        setupMediaSession();
    }

    if (albumArtDisplayMode === "video") {
        requestAnimationFrame(() => initializeVideoPlayerInAlbumArt());
    }

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
    document.getElementById("totalTime").innerText = "-0:00";

    playing = true;
    document.getElementById("playPauseBtn").innerHTML = ICON_PAUSE;

    // ✅ Start tracking progress
    updateProgressBar();
}

function getCurrentPlayerVideoId() {
    try {
        const data = player && typeof player.getVideoData === "function"
            ? player.getVideoData()
            : null;
        return (data && data.video_id) || actualSelectedVideoId || selectedVideoId || "";
    } catch (error) {
        return actualSelectedVideoId || selectedVideoId || "";
    }
}

function updateVideoPlayerOnModeChange() {
    if (albumArtDisplayMode === "video" && getCurrentPlayerVideoId()) {
        requestAnimationFrame(() => initializeVideoPlayerInAlbumArt());
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

        updateSongTitle(firstSongName);
        updateAuthorName(firstAuthorName);
    }
    setupMediaSession();
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
    const currentVideoId = getCurrentPlayerVideoId();
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
            initializeVideoPlayerInAlbumArt();
            break;
    }
    
    // Save the setting
    localStorage.setItem("albumArtDisplayMode", albumArtDisplayMode);
    localStorage.setItem("albumArtSpin", JSON.stringify(albumArtSpinEnabled));
}

// The visible video and audio playback must use the same iframe player.
// Never create a second player here.
function initializeVideoPlayerInAlbumArt() {
    const videoContainer = document.getElementById("videoPlayerInAlbumArt");
    if (!videoContainer || !player || typeof player.getIframe !== "function") return;

    requestAnimationFrame(() => {
        const width = Math.max(1, Math.round(videoContainer.clientWidth || 250));
        const height = width;

        if (typeof player.setSize === "function") {
            player.setSize(width, height);
        }

        const iframe = player.getIframe();
        if (iframe) {
            iframe.style.width = "100%";
            iframe.style.height = "100%";
            iframe.style.display = "block";
            iframe.style.border = "0";
        }
    });
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
        if (!player || !player.getCurrentTime || isDragging) {
            return;
        }

        const currentTime = player.getCurrentTime();
        const duration = player.getDuration();

        if (duration > 0) {
            const progressPercent = (currentTime / duration) * 100;

            document.getElementById("progress").style.width = `${progressPercent}%`;
            document.getElementById("currentTime").innerText = formatTime(currentTime);
            const remainingTime = Math.max(0, duration - currentTime);
            document.getElementById("totalTime").innerText = `-${formatTime(remainingTime)}`;
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

    if (event.data === YT.PlayerState.ENDED) {
        clearInterval(progressInterval);
        playing = false;

        if (albumArtSpinEnabled) {
            albumArt.classList.add("rotate-paused");
        }

        // Repeat has priority over Auto-Play.
        if (repeatSong) {
            player.seekTo(0, true);
            player.playVideo();
            updateProgressBar();
            return;
        }

        if (autoPlayEnabled && playlist.length > 1) {
            playNextSong();
            return;
        }

        playPauseBtn.innerHTML = ICON_REVISION;

        if ("mediaSession" in navigator) {
            navigator.mediaSession.playbackState = "none";
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
document.addEventListener("DOMContentLoaded", () => {
    const autoPlayToggle = document.getElementById("autoPlayToggle");
    const repeatBtn = document.getElementById("repeatBtn");

    if (!autoPlayToggle || !repeatBtn) {
        return;
    }

    function updatePlaybackModeButtons() {
        autoPlayToggle.classList.toggle("active", autoPlayEnabled);
        autoPlayToggle.setAttribute(
            "aria-pressed",
            String(autoPlayEnabled)
        );

        autoPlayToggle.innerHTML = autoPlayEnabled
            ? '<i class="bx bx-play-circle"></i>'
            : '<i class="bx bx-stop-circle"></i>';

        repeatBtn.classList.toggle("active", repeatSong);
        repeatBtn.setAttribute("aria-pressed", String(repeatSong));
    }

    autoPlayToggle.addEventListener("click", () => {
        autoPlayEnabled = !autoPlayEnabled;
        localStorage.setItem("autoPlay", String(autoPlayEnabled));
        updatePlaybackModeButtons();
    });

    repeatBtn.addEventListener("click", () => {
        repeatSong = !repeatSong;
        localStorage.setItem("repeatSong", String(repeatSong));
        updatePlaybackModeButtons();
    });

    updatePlaybackModeButtons();
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
    
    // Import playlist functionality. Android uses the native file picker,
    // while GitHub Pages, Vercel and normal browsers use the HTML input.
    settingsImportBtn.addEventListener("click", async function() {
        closeSettingsMenu();

        if (isRunningInNativeCapacitor()) {
            await chooseAndImportPlaylistOnAndroid();
        } else {
            importFileInput.click();
        }
    });
    
    // Handle file selection for import
    importFileInput.addEventListener('change', function(e) {
        if (e.target.files && e.target.files.length > 0) {
            const file = e.target.files[0];
            
            if (isSupportedPlaylistImportFile(file.name, file.type)) {
                importPlaylist(file);
            } else {
                alert(translations[currentLang].importFileTypeError);
            }
            this.value = '';
        }
    });
    
    // Close menu when clicking outside
    document.addEventListener("click", function (event) {
        const clickedInsideSettings = event.target.closest(".floating-settings");
        const clickedInsideCacheManager = event.target.closest(
            "#cacheManagerWindow, #cacheManagerOverlay, #cacheItemDetailsModal"
        );

        if (
            !clickedInsideSettings &&
            !clickedInsideCacheManager &&
            settingsMenu.classList.contains("show")
        ) {
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

// Return a Capacitor native plugin without requiring a JavaScript bundler.
// Capacitor injects registerPlugin() into the Android WebView at runtime.
function getCapacitorNativePlugin(pluginName) {
    const capacitor = window.Capacitor;

    if (!capacitor) {
        return null;
    }

    if (capacitor.Plugins && capacitor.Plugins[pluginName]) {
        return capacitor.Plugins[pluginName];
    }

    if (typeof capacitor.registerPlugin === "function") {
        return capacitor.registerPlugin(pluginName);
    }

    return null;
}

function isRunningInNativeCapacitor() {
    const capacitor = window.Capacitor;
    return Boolean(
        capacitor &&
        typeof capacitor.isNativePlatform === "function" &&
        capacitor.isNativePlatform()
    );
}

function downloadTextFileInBrowser(fileName, fileContent) {
    const blob = new Blob([fileContent], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = fileName;
    link.style.display = "none";

    document.body.appendChild(link);
    link.click();

    setTimeout(() => {
        link.remove();
        URL.revokeObjectURL(url);
    }, 1000);
}

async function exportTextFileOnAndroid(fileName, fileContent) {
    const Filesystem = getCapacitorNativePlugin("Filesystem");
    const Share = getCapacitorNativePlugin("Share");

    if (!Filesystem || !Share) {
        throw new Error(
            "Capacitor Filesystem or Share plugin is unavailable. Run npm install and npx cap sync android before rebuilding."
        );
    }

    // Android's Share plugin can share files from the app cache directory by default.
    // The Android share sheet then lets the user save the file to Files/Downloads,
    // Drive, email, messaging apps, and other installed destinations.
    const writeResult = await Filesystem.writeFile({
        path: fileName,
        data: fileContent,
        directory: "CACHE",
        encoding: "utf8",
        recursive: true
    });

    if (!writeResult || !writeResult.uri) {
        throw new Error("The exported playlist file was created without a usable URI.");
    }

    await Share.share({
        title: fileName,
        text: "YouTube Music Player playlist export",
        files: [writeResult.uri],
        dialogTitle: "Export playlist file"
    });
}

// Export playlist function
async function exportPlaylist() {
    try {
        // Get current playlist and app settings.
        const exportData = {
            playlist: playlist,
            albumArtDisplayMode: albumArtDisplayMode,
            darkMode: localStorage.getItem("darkMode") === "enabled",
            showLyrics: localStorage.getItem("showLyrics") === "true",
            language: currentLang,
            translationEnabled: translationEnabled,
            showOriginalFirst: showOriginalFirst,
            titleGapFraction: GAP_FRACTION,
            titleScrollSpeed: TITLE_SCROLL_SPEED,
            allowLyricsFetchWhenHidden: allowLyricsFetchWhenHidden,
            allowLyricsTranslationWhenHidden: allowLyricsTranslationWhenHidden,
            exportDate: new Date().toISOString(),
            version: "1.6-alpha"
        };

        const playlistData = JSON.stringify(exportData, null, 2);
        const date = new Date().toISOString().slice(0, 10);
        const fileName = `youtube-music-playlist-${date}.txt`;

        if (isRunningInNativeCapacitor()) {
            await exportTextFileOnAndroid(fileName, playlistData);
        } else {
            downloadTextFileInBrowser(fileName, playlistData);
        }
    } catch (error) {
        console.error("Error exporting playlist:", error);
        alert(translations[currentLang].exportError);
    }
}

// Check imported playlist file name and MIME type.
// Android file providers sometimes return an empty or generic MIME type,
// so a valid .txt or .json extension is also accepted.
function isSupportedPlaylistImportFile(fileName, mimeType) {
    const normalizedName = String(fileName || "").toLowerCase();
    const normalizedMime = String(mimeType || "").toLowerCase();

    const supportedExtension =
        normalizedName.endsWith(".txt") ||
        normalizedName.endsWith(".json");

    const supportedMime =
        normalizedMime === "text/plain" ||
        normalizedMime === "application/json";

    return supportedExtension || supportedMime;
}

// Decode the Base64 content returned by the native Android file picker.
function decodeBase64Text(base64Data) {
    const cleanedData = String(base64Data || "")
        .replace(/^data:[^,]*,/, "")
        .replace(/\s/g, "");

    const binary = atob(cleanedData);
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
    }

    return new TextDecoder("utf-8").decode(bytes);
}

// Read a file selected by the native Android picker.
async function readNativePickedFileAsText(pickedFile) {
    if (typeof pickedFile.data === "string" && pickedFile.data.length > 0) {
        return decodeBase64Text(pickedFile.data);
    }

    // Web implementation of the plugin can return a Blob.
    if (pickedFile.blob instanceof Blob) {
        return pickedFile.blob.text();
    }

    // Fallback for native plugin versions that return only a file path.
    if (pickedFile.path) {
        const capacitor = window.Capacitor;
        const readablePath =
            capacitor && typeof capacitor.convertFileSrc === "function"
                ? capacitor.convertFileSrc(pickedFile.path)
                : pickedFile.path;

        const response = await fetch(readablePath);

        if (!response.ok) {
            throw new Error(`Unable to read selected file (${response.status}).`);
        }

        return response.text();
    }

    throw new Error("The selected file did not contain readable data.");
}

// Open Android's native document picker and pass the selected playlist file
// into the same import function used by GitHub Pages and Vercel.
async function chooseAndImportPlaylistOnAndroid() {
    try {
        const FilePicker = getCapacitorNativePlugin("FilePicker");

        if (!FilePicker) {
            throw new Error(
                "Capacitor File Picker is unavailable. Run npm install and npx cap sync android before rebuilding."
            );
        }

        const result = await FilePicker.pickFiles({
            types: ["application/json", "text/plain"],
            readData: true
        });

        const pickedFile = result && result.files && result.files[0];

        if (!pickedFile) {
            return;
        }

        if (!isSupportedPlaylistImportFile(pickedFile.name, pickedFile.mimeType)) {
            alert(translations[currentLang].importFileTypeError);
            return;
        }

        // Playlist exports are small text files. Reject unexpectedly large files
        // before decoding Base64 inside the WebView.
        const maximumImportSize = 5 * 1024 * 1024;
        if (Number(pickedFile.size) > maximumImportSize) {
            throw new Error("The selected playlist file is larger than 5 MB.");
        }

        const fileText = await readNativePickedFileAsText(pickedFile);
        const fileName = pickedFile.name || "youtube-music-playlist.txt";
        const mimeType = pickedFile.mimeType || "text/plain";

        const importedFile = new Blob([fileText], { type: mimeType });
        Object.defineProperty(importedFile, "name", {
            value: fileName,
            configurable: true
        });

        importPlaylist(importedFile);
    } catch (error) {
        const message = String(error && error.message ? error.message : error);

        // Closing Android's document picker is not an import failure.
        if (/cancel|canceled|cancelled|dismiss/i.test(message)) {
            return;
        }

        console.error("Error selecting playlist file:", error);
        alert(translations[currentLang].importError + message);
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
            let importDarkMode;
            let importLanguage = currentLang;
            let importTranslationEnabled = translationEnabled;
            let importShowOriginalFirst = showOriginalFirst;
            let importTitleGapFraction = GAP_FRACTION;
            let importTitleScrollSpeed = TITLE_SCROLL_SPEED;
            let importAllowLyricsFetchWhenHidden = allowLyricsFetchWhenHidden;
            let importAllowLyricsTranslationWhenHidden = allowLyricsTranslationWhenHidden;
            
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
                if (Object.prototype.hasOwnProperty.call(importedData, "titleGapFraction")) {
                    const importedGapFraction = Number(importedData.titleGapFraction);

                    if (Number.isFinite(importedGapFraction)) {
                        importTitleGapFraction = importedGapFraction;
                    }
                }
                if (Object.prototype.hasOwnProperty.call(importedData, "titleScrollSpeed")) {
                    const importedSpeed = Number(importedData.titleScrollSpeed);

                    if (Number.isFinite(importedSpeed)) {
                        importTitleScrollSpeed = importedSpeed;
                    }
                }
                if (typeof importedData.allowLyricsFetchWhenHidden === "boolean") {
                    importAllowLyricsFetchWhenHidden =
                        importedData.allowLyricsFetchWhenHidden;
                }

                if (typeof importedData.allowLyricsTranslationWhenHidden === "boolean") {
                    importAllowLyricsTranslationWhenHidden =
                        importedData.allowLyricsTranslationWhenHidden;
                }
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

                allowLyricsFetchWhenHidden = importAllowLyricsFetchWhenHidden;
                allowLyricsTranslationWhenHidden = importAllowLyricsTranslationWhenHidden;

                localStorage.setItem("allowLyricsFetchWhenHidden", String(allowLyricsFetchWhenHidden));
                localStorage.setItem("allowLyricsTranslationWhenHidden", String(allowLyricsTranslationWhenHidden));
                
                // Apply translation order setting if included in export
                if (importedData.showOriginalFirst !== undefined) {
                    showOriginalFirst = importedData.showOriginalFirst;
                    localStorage.setItem("showOriginalFirst", JSON.stringify(showOriginalFirst));
                }

                setTitleGapFraction(importTitleGapFraction);
                setTitleScrollSpeed(importTitleScrollSpeed);
                
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
                    updateSongTitle(firstSong.songName);
                    updateAuthorName(firstSong.authorName);

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
                    document.getElementById("totalTime").innerText = "-0:00";
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
        typeof item === "object" &&
        typeof item.videoId === "string" &&
        typeof item.songName === "string" &&
        typeof item.authorName === "string" &&
        (typeof item.albumArt === "string" || item.albumArt === undefined) &&
        (
            item.lyricsTimeOffset === undefined ||
            Number.isFinite(Number(item.lyricsTimeOffset))
        );
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

    el.innerHTML = lines.map((line, index) => {
        const lyric = (line.text || "").trim();

        // Remove timestamp rows that contain no lyric text.
        if (!lyric) return "";

        const minutes = Math.floor(line.time / 60);
        const seconds = Math.floor(line.time % 60);
        const formattedTime = `${minutes}:${seconds < 10 ? "0" + seconds : seconds}`;

        return `
            <div class="lrc-line"
                 data-index="${index}"
                 data-time="${line.time}"
                 data-formatted-time="${formattedTime}">
                <span class="lrc-text">${lyric}</span>
            </div>
        `;
    }).join("");
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
          meta.textContent = `${t.lyricsSyncedFound} ${artist} – ${title}`;
          lyricsState = {
                status: "synced",
                artist,
                title,
                videoId: job.videoId
            };
        } else {
          lyricsData = { isLrc: false, plain: lyrics };
          const lines = lyrics.split(/\r?\n/).filter(l => l.trim().length > 0);
          textEl.innerHTML = lines.map(line => `<div class="plain-line">${line}</div>`).join("");
          meta.textContent = `${t.lyricsPlainFound} ${artist} – ${title}`;
          lyricsState = {
                status: "plain",
                artist,
                title,
                videoId: job.videoId
            };
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
    if (!isCurrent()) {
        return;
    }

    // ✅ If no lyrics found, try CJK-only artist
    if (!json.syncedLyrics && !json.plainLyrics) {
      const cjkOnlyArtist = artist.replace(/[\u0020A-Za-z]+/g, "").trim();
      if (cjkOnlyArtist && cjkOnlyArtist !== artist) {
        console.log("Retrying with CJK only:", cjkOnlyArtist);
        json = await tryFetch(cjkOnlyArtist, title);
        json = await tryFetch(artist, title);
        if (json.syncedLyrics || json.plainLyrics) {
          artist = cjkOnlyArtist; // ✅ Update to working version
        }
      }
    }

    const lyrics = json.syncedLyrics || json.plainLyrics;
    if (!lyrics) {      
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
      lyricsState = {
            status: "plain",
            artist,
            title,
            videoId: job.videoId
        };
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
    youtubeApiKeyError: "YouTube API Key is not configured. Please ensure the key is set.",
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
    chinese: "Simplified Chinese",
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
    feature8: "Multi-language support ({languages})",
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
    en: "English",
    zh: "Simplified Chinese",
    "zh-TW": "Traditional Chinese",
    ja: "Japanese",
    ko: "Korean",
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
    youtubeApiKeyError: "YouTube API 密钥未配置。请确保已设置密钥。。",
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
    chinese: "简体中文",
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
    feature8: "多语言支持（{languages}）",
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
    en: "英文",
    zh: "简体中文",
    "zh-TW": "繁體中文",
    ja: "日文",
    ko: "韩文",
  },
  ja: {
    playerTitle: "YouTube Music Player",
    autoPlay: "自動再生",
    repeat: "リピート",
    lyrics: "歌詞",
    lyricsNoLoad: "歌詞が読み込まれていません",
    lyricsSyncedFound: "同期歌詞が見つかりました：",
    lyricsPlainFound: "歌詞が見つかりました：",
    lyricsNotFound: "歌詞が見つかりません。",
    lyricsError: "歌詞の取得中にエラーが発生しました。",
    lyricsFetching: "歌詞を取得中...",
    autoSyncOn: "自動同期：オン",
    autoSyncOff: "自動同期：オフ",
    refresh: "更新",
    raw: "生データ",
    showPlaylist: "マイプレイリスト",
    searchPlaylist: "プレイリストを検索...",
    clearSearch: "検索をクリア",
    searchPlaylistPlaceholder: "プレイリストを検索...",
    songName: "曲名",
    authorName: "アーティスト名",
    dragToReorder: "ドラッグして並べ替え",
    numberHeader: "番号",
    actionHeader: "操作",
    songUnavailable: "この曲は利用できません。",
    seconds: "秒後にスキップします",
    youtubeSearchTitle: "YouTube を検索",
    youtubeSearchPlaceholder: "追加する曲を YouTube で検索...",
    youtubeSearchBtn: "検索",
    searchResultsTitle: "検索結果：",
    youtubeSearching: "YouTube を検索中...",
    youtubeSearchError: "YouTube を検索できません。インターネット接続を確認して、もう一度お試しください。",
    youtubeApiKeyError: "YouTube APIキーが設定されていません。キーが正しく設定されていることを確認してください。",
    removeSongTitle: "曲を削除",
    settingsTitle: "設定",
    searchYouTubeTitle: "YouTube を検索",
    exportTitle: "プレイリストとデータをエクスポート",
    importTitle: "プレイリストとデータをインポート",
    exportPlaylist: "プレイリストとデータをエクスポート",
    importPlaylist: "プレイリストとデータをインポート",
    clearCache: "キャッシュ管理",
    albumArtSpin: "アルバムアートを回転",
    showLyrics: "歌詞",
    darkMode: "ダークモード",
    toggleLyricsTooltip: "歌詞の表示／非表示を切り替える",
    goTop: "先頭へ戻る",
    creatorTitle: "オリジナル制作者",
    creatorDesc: "この YouTube Music Player プロジェクトのオリジナル制作者です。",
    creatorBtn: "オリジナル制作者",
    visitRepo: "リポジトリを表示",
    maintainerTitle: "フォーク版メンテナー",
    maintainerDesc: "機能が強化された<a href='https://github.com/Farwalker3/YouTube-Music-Player-Web' target='_blank'>このフォーク版</a>のメンテナーです。",
    maintainerBtn: "フォーク版メンテナー",
    experimentalWindowTitle: "実験的プロジェクト",
    experimentalWindowWarning: "⚠ 警告：このプロジェクトは不安定または安全でない可能性があります。自己責任でご利用ください。",
    readExcelTitle: "Excel ファイルの読み込み方法",
    readApiKeyTitle: "API キーの読み込み方法",
    viewBetaBtn: "ベータテスト版を表示",
    viewAlphaBtn: "アルファテスト版を表示",
    viewBetaTooltip: "ベータテスト版を表示",
    viewAlphaTooltip: "アルファテスト版を表示",
    attributionText: "オリジナルプロジェクト：",
    attributionEnhanced: "機能強化版：",
    attributionRepo: "オリジナルリポジトリ",
    languageLabel: "言語",
    songAlreadyExists: "この曲はすでにプレイリストにあります！",
    songAdded: " をプレイリストに追加しました！",
    importFileTypeError: "JSON データを含む JSON ファイルまたは TXT ファイルを選択してください。",
    cacheCleared: "検索キャッシュを削除しました！次回の検索では新しい結果を取得します。",
    exportError: "プレイリストのエクスポート中にエラーが発生しました。もう一度お試しください。",
    importError: "プレイリストのインポート中にエラーが発生しました：",
    fileReadError: "ファイルの読み込み中にエラーが発生しました。もう一度お試しください。",
    noLyricsLoaded: "歌詞が読み込まれていません。",
    clearCacheConfirm: "検索キャッシュを削除してもよろしいですか？保存されている検索結果がすべて削除されます。",
    importConfirm: "${count} 曲をインポートしますか？現在のプレイリストは置き換えられます。",
    importSuccess: "${count} 曲を正常にインポートしました！",
    darkModeStatus: "ダークモードを${status}にしました。",
    albumArtSpinStatus: "アルバムアートの回転を${status}にしました。",
    lyricsPanelStatus: "歌詞パネルを${status}にしました。",
    languageSet: "言語を${language}に設定しました。",
    enabled: "有効",
    disabled: "無効",
    chinese: "中国語",
    english: "英語",
    japanese: "日本語",
    addToPlaylist: "プレイリストに追加",
    add: "追加",
    invalidLink: "⚠ 無効な YouTube リンクです。",
    duplicateSong: "⚠ この曲はすでにプレイリストにあります！",
    addedSong: (title, author) => `✅ 「${title}」- ${author} をプレイリストに追加しました！`,
    aboutTitle: "YouTube Music Player について",
    aboutDescription: "YouTube を音楽ソースとして使用する、多機能なウェブベースの音楽プレーヤーです。お気に入りの音楽をすっきりとした直感的な画面で再生、管理、整理できます。",
    featuresTitle: "機能",
    feature1: "YouTube 音楽再生",
    feature2: "ドラッグ＆ドロップによるプレイリスト管理",
    feature3: "自動同期対応の歌詞表示",
    feature4: "歌詞翻訳",
    feature5: "ダーク／ライトモード",
    feature6: "プレイリストのエクスポート／インポート",
    feature7: "音量調整と再生進行バー",
    feature8: "多言語対応（{languages}）",
    feature9: "自動再生とリピートモード",
    originalProjectTitle: "オリジナルプロジェクト",
    originalCreator: "オリジナル制作者",
    contributorsTitle: "貢献者",
    forkMaintainer: "フォーク版メンテナー",
    linksTitle: "リンク",
    originalRepository: "オリジナルリポジトリ",
    versionInfoTitle: "バージョン情報",
    version: "バージョン：",
    lastUpdated: "最終更新：",
    languages: "対応言語：",
    experimentalFeatures: "実験的機能",
    settingsAboutTitle: "このプロジェクトについて",
    settingsAbout: "概要",
    albumArtDisplay: "アルバムアート表示：",
    spin: "回転",
    none: "なし",
    video: "ビデオ",
    youtubeApi403Error: "YouTube API エラー：403 - 割り当て上限を超えました。API キーが1日の利用上限に達しています。明日もう一度お試しいただくか、別の API キーを使用してください。",
    translationStatus: "歌詞翻訳を${status}にしました。",
    enableLyricsTranslation: "歌詞翻訳",
    showOriginalFirstLabel: "原文を先に表示",
    noResultsFound: "結果が見つかりません。",
    searchCache: "検索キャッシュ",
    lyricsCache: "歌詞キャッシュ",
    translationCache: "翻訳キャッシュ",
    unknown: "不明",
    viewDetails: "詳細を表示",
    delete: "削除",
    noCacheItems: "キャッシュ項目が見つかりません",
    totalItems: "合計項目数",
    totalSize: "合計サイズ",
    selectAll: "すべて選択",
    clearSelected: "選択項目を削除",
    clearAll: "すべてのキャッシュを削除",
    cacheManagerTitle: "キャッシュ管理",
    cacheItems: "キャッシュ項目",
    cacheKey: "キャッシュキー",
    cacheType: "種類",
    cacheSize: "サイズ",
    cacheAge: "経過時間",
    actions: "操作",
    confirmDeleteSelected: "選択した {count} 件の項目を削除しますか？",
    confirmDeleteItem: "このキャッシュ項目を削除しますか？",
    confirmClearAllCache: "すべてのキャッシュを削除してもよろしいですか？この操作は元に戻せません。",
    noItemsSelected: "項目が選択されていません",
    copiedToClipboard: "クリップボードにコピーしました！",
    cacheItemDetails: "キャッシュの詳細",
    cacheContent: "内容",
    copyContent: "内容をコピー",
    deleteItem: "項目を削除",
    close: "閉じる",
    search: "検索",
    translation: "翻訳",
    all: "すべて",
    itemsSelected: "{count} 件選択中",
    cacheStats: "キャッシュ統計",
    expiresIn: "有効期限まで",
    never: "なし",
    expired: "期限切れ",
    valid: "有効",
    invalid: "無効",
    en: "英語",
    zh: "中国語",
    "zh-TW": "繁体字中国語",
    ja: "日本語",
    ko: "韓国語",
  },
  ko: {
    playerTitle: "YouTube Music Player",
    autoPlay: "자동 재생",
    repeat: "반복",
    lyrics: "가사",
    lyricsNoLoad: "불러온 가사가 없습니다",
    lyricsSyncedFound: "동기화된 가사를 찾았습니다:",
    lyricsPlainFound: "가사를 찾았습니다:",
    lyricsNotFound: "가사를 찾을 수 없습니다.",
    lyricsError: "가사를 가져오는 중 오류가 발생했습니다.",
    lyricsFetching: "가사를 불러오는 중...",
    autoSyncOn: "자동 동기화: 켜짐",
    autoSyncOff: "자동 동기화: 꺼짐",
    refresh: "새로고침",
    raw: "원본 데이터",
    showPlaylist: "내 플레이리스트",
    searchPlaylist: "플레이리스트 검색...",
    clearSearch: "검색 지우기",
    searchPlaylistPlaceholder: "플레이리스트 검색...",
    songName: "곡명",
    authorName: "아티스트명",
    dragToReorder: "드래그하여 순서 변경",
    numberHeader: "번호",
    actionHeader: "작업",
    songUnavailable: "이 곡은 사용할 수 없습니다. 다음 시간 후 건너뜁니다:",
    seconds: "초",
    youtubeSearchTitle: "YouTube 검색",
    youtubeSearchPlaceholder: "추가할 노래를 YouTube에서 검색...",
    youtubeSearchBtn: "검색",
    searchResultsTitle: "검색 결과:",
    youtubeSearching: "YouTube 검색 중...",
    youtubeSearchError: "YouTube를 검색할 수 없습니다. 인터넷 연결을 확인한 후 다시 시도하세요.",
    youtubeApiKeyError: "YouTube API 키가 설정되어 있지 않습니다. API 키가 설정되어 있는지 확인하십시오.",
    removeSongTitle: "곡 삭제",
    settingsTitle: "설정",
    searchYouTubeTitle: "YouTube 검색",
    exportTitle: "플레이리스트 및 데이터 내보내기",
    importTitle: "플레이리스트 및 데이터 가져오기",
    exportPlaylist: "플레이리스트 및 데이터 내보내기",
    importPlaylist: "플레이리스트 및 데이터 가져오기",
    clearCache: "캐시 관리자",
    albumArtSpin: "앨범 아트 회전",
    showLyrics: "가사",
    darkMode: "다크 모드",
    toggleLyricsTooltip: "가사 표시 또는 숨기기",
    goTop: "맨 위로",
    creatorTitle: "원작자",
    creatorDesc: "이 YouTube Music Player 프로젝트의 원작자입니다.",
    creatorBtn: "원작자",
    visitRepo: "리포지토리 방문",
    maintainerTitle: "포크 버전 관리자",
    maintainerDesc: "향상된 기능이 포함된 <a href='https://github.com/Farwalker3/YouTube-Music-Player-Web' target='_blank'>이 포크 버전</a>의 관리자입니다.",
    maintainerBtn: "포크 버전 관리자",
    experimentalWindowTitle: "실험적 프로젝트",
    experimentalWindowWarning: "⚠ 경고: 이 프로젝트는 불안정하거나 안전하지 않을 수 있습니다. 사용에 주의하세요.",
    readExcelTitle: "Excel 파일 읽기 방법",
    readApiKeyTitle: "API 키 읽기 방법",
    viewBetaBtn: "베타 테스트 프로젝트 보기",
    viewAlphaBtn: "알파 테스트 프로젝트 보기",
    viewBetaTooltip: "베타 테스트 프로젝트 보기",
    viewAlphaTooltip: "알파 테스트 프로젝트 보기",
    attributionText: "원본 프로젝트:",
    attributionEnhanced: "향상된 버전:",
    attributionRepo: "원본 리포지토리",
    languageLabel: "언어",
    songAlreadyExists: "이 곡은 이미 플레이리스트에 있습니다!",
    songAdded: "을(를) 플레이리스트에 추가했습니다!",
    importFileTypeError: "JSON 데이터가 포함된 JSON 파일 또는 TXT 파일을 선택하세요.",
    cacheCleared: "검색 캐시가 삭제되었습니다! 새 검색에서는 최신 결과를 가져옵니다.",
    exportError: "플레이리스트를 내보내는 중 오류가 발생했습니다. 다시 시도하세요.",
    importError: "플레이리스트를 가져오는 중 오류가 발생했습니다: ",
    fileReadError: "파일을 읽는 중 오류가 발생했습니다. 다시 시도하세요.",
    noLyricsLoaded: "불러온 가사가 없습니다.",
    clearCacheConfirm: "검색 캐시를 삭제하시겠습니까? 저장된 모든 검색 결과가 삭제됩니다.",
    importConfirm: "${count}곡을 가져오시겠습니까? 현재 플레이리스트가 교체됩니다.",
    importSuccess: "${count}곡을 성공적으로 가져왔습니다!",
    darkModeStatus: "다크 모드가 ${status}되었습니다.",
    albumArtSpinStatus: "앨범 아트 회전이 ${status}되었습니다.",
    lyricsPanelStatus: "가사 패널이 ${status}되었습니다.",
    languageSet: "언어가 ${language}로 설정되었습니다.",
    enabled: "활성화",
    disabled: "비활성화",
    chinese: "중국어",
    english: "영어",
    korean: "한국어",
    addToPlaylist: "플레이리스트에 추가",
    add: "추가",
    invalidLink: "⚠ 잘못된 YouTube 링크입니다.",
    duplicateSong: "⚠ 이 곡은 이미 플레이리스트에 있습니다!",
    addedSong: (title, author) => `✅ "${title}" - ${author}을(를) 플레이리스트에 추가했습니다!`,
    aboutTitle: "YouTube Music Player 정보",
    aboutDescription: "YouTube를 음악 소스로 사용하는 기능이 풍부한 웹 기반 음악 플레이어입니다. 깔끔하고 직관적인 인터페이스에서 좋아하는 음악을 재생, 관리 및 정리할 수 있습니다.",
    featuresTitle: "기능",
    feature1: "YouTube 음악 재생",
    feature2: "드래그 앤 드롭 플레이리스트 관리",
    feature3: "자동 동기화 가사 표시",
    feature4: "가사 번역",
    feature5: "다크/라이트 모드",
    feature6: "플레이리스트 내보내기/가져오기",
    feature7: "볼륨 조절 및 재생 진행 바",
    feature8: "다국어 지원 ({languages})",
    feature9: "자동 재생 및 반복 모드",
    originalProjectTitle: "원본 프로젝트",
    originalCreator: "원작자",
    contributorsTitle: "기여자",
    forkMaintainer: "포크 버전 관리자",
    linksTitle: "링크",
    originalRepository: "원본 리포지토리",
    versionInfoTitle: "버전 정보",
    version: "버전: ",
    lastUpdated: "마지막 업데이트: ",
    languages: "지원 언어: ",
    experimentalFeatures: "실험적 기능",
    settingsAboutTitle: "이 프로젝트 정보",
    settingsAbout: "정보",
    albumArtDisplay: "앨범 아트 표시:",
    spin: "회전",
    none: "없음",
    video: "비디오",
    youtubeApi403Error: "YouTube API 오류: 403 - 할당량 초과. API 키가 일일 한도에 도달했습니다. 내일 다시 시도하거나 다른 API 키를 사용하세요.",
    translationStatus: "가사 번역이 ${status}되었습니다.",
    enableLyricsTranslation: "가사 번역",
    showOriginalFirstLabel: "원문 먼저 표시",
    noResultsFound: "검색 결과가 없습니다.",
    searchCache: "검색 캐시",
    lyricsCache: "가사 캐시",
    translationCache: "번역 캐시",
    unknown: "알 수 없음",
    viewDetails: "세부 정보 보기",
    delete: "삭제",
    noCacheItems: "캐시 항목이 없습니다",
    totalItems: "총 항목 수",
    totalSize: "총 크기",
    selectAll: "모두 선택",
    clearSelected: "선택 항목 삭제",
    refresh: "새로고침",
    clearAll: "모든 캐시 삭제",
    cacheManagerTitle: "캐시 관리자",
    cacheItems: "캐시 항목",
    cacheKey: "캐시 키",
    cacheType: "유형",
    cacheSize: "크기",
    cacheAge: "경과 시간",
    actions: "작업",
    confirmDeleteSelected: "선택한 {count}개 항목을 삭제하시겠습니까?",
    confirmDeleteItem: "이 캐시 항목을 삭제하시겠습니까?",
    confirmClearAllCache: "모든 캐시를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.",
    noItemsSelected: "선택된 항목이 없습니다",
    copiedToClipboard: "클립보드에 복사되었습니다!",
    cacheItemDetails: "캐시 세부 정보",
    cacheContent: "내용",
    copyContent: "내용 복사",
    deleteItem: "항목 삭제",
    close: "닫기",
    search: "검색",
    lyrics: "가사",
    translation: "번역",
    all: "전체",
    itemsSelected: "{count}개 항목 선택됨",
    cacheStats: "캐시 통계",
    expiresIn: "만료까지",
    never: "없음",
    expired: "만료됨",
    valid: "유효",
    invalid: "유효하지 않음",
    en: "영어",
    zh: "중국어",
    "zh-TW": "번체 중국어",
    ja: "일본어",
    ko: "한국어",
  },
  "zh-TW": {
    playerTitle: "YouTube 音樂播放器",
    autoPlay: "自動播放",
    repeat: "重複播放",
    lyrics: "歌詞",
    lyricsNoLoad: "尚未載入歌詞",
    lyricsSyncedFound: "已找到同步歌詞：",
    lyricsPlainFound: "已找到純文字歌詞：",
    lyricsNotFound: "找不到歌詞。",
    lyricsError: "取得歌詞時發生錯誤。",
    lyricsFetching: "正在載入歌詞...",
    autoSyncOn: "自動同步：開啟",
    autoSyncOff: "自動同步：關閉",
    refresh: "重新整理",
    raw: "原始資料",
    showPlaylist: "我的播放清單",
    searchPlaylist: "搜尋你的播放清單...",
    clearSearch: "清除搜尋",
    searchPlaylistPlaceholder: "搜尋你的播放清單...",
    songName: "歌曲名稱",
    authorName: "作者名稱",
    dragToReorder: "拖曳以重新排序",
    numberHeader: "編號",
    actionHeader: "操作",
    songUnavailable: "此歌曲無法播放。將在",
    seconds: "秒後跳過",
    youtubeSearchTitle: "搜尋 YouTube",
    youtubeSearchPlaceholder: "在 YouTube 搜尋要加入的歌曲...",
    youtubeSearchBtn: "搜尋",
    searchResultsTitle: "搜尋結果：",
    youtubeSearching: "正在搜尋 YouTube...",
    youtubeSearchError: "無法搜尋 YouTube。請檢查你的網路連線後再試。",
    youtubeApiKeyError: "YouTube API 金鑰未配置。請確保已設定密鑰。。",
    removeSongTitle: "移除歌曲",
    settingsTitle: "設定",
    searchYouTubeTitle: "搜尋 YouTube",
    exportTitle: "匯出播放清單與資料",
    importTitle: "匯入播放清單與資料",
    exportPlaylist: "匯出播放清單與資料",
    importPlaylist: "匯入播放清單與資料",
    clearCache: "快取管理",
    albumArtSpin: "專輯封面旋轉",
    showLyrics: "歌詞",
    darkMode: "深色模式",
    toggleLyricsTooltip: "切換顯示或隱藏歌詞",
    goTop: "回到頂端",
    creatorTitle: "原始創作者",
    creatorDesc: "此 YouTube 音樂播放器專案的原始創作者。",
    creatorBtn: "原始創作者",
    visitRepo: "前往儲存庫",
    maintainerTitle: "分支維護者",
    maintainerDesc: "維護具備強化功能的<a href='https://github.com/Farwalker3/YouTube-Music-Player-Web' target='_blank'>此分支版本</a>。",
    maintainerBtn: "分支維護者",
    experimentalWindowTitle: "實驗性專案",
    experimentalWindowWarning: "⚠ 警告：此專案可能不穩定且存在風險，請自行承擔使用風險。",
    readExcelTitle: "讀取 Excel 檔案方法",
    readApiKeyTitle: "讀取 API 金鑰方法",
    viewBetaBtn: "查看 Beta 測試專案",
    viewAlphaBtn: "查看 Alpha 測試專案",
    viewBetaTooltip: "查看 Beta 測試專案",
    viewAlphaTooltip: "查看 Alpha 測試專案",
    attributionText: "原始專案由",
    attributionEnhanced: "強化版本由",
    attributionRepo: "原始儲存庫",
    languageLabel: "語言",
    songAlreadyExists: "此歌曲已在你的播放清單中！",
    songAdded: " 已加入你的播放清單！",
    importFileTypeError: "請選擇包含 JSON 資料的 JSON 或 TXT 檔案。",
    cacheCleared: "搜尋快取已清除！新的搜尋將取得最新結果。",
    exportError: "匯出播放清單時發生錯誤，請再試一次。",
    importError: "匯入播放清單時發生錯誤：",
    fileReadError: "讀取檔案時發生錯誤，請再試一次。",
    noLyricsLoaded: "尚未載入歌詞。",
    clearCacheConfirm: "確定要清除搜尋快取嗎？這將移除所有已儲存的搜尋結果。",
    importConfirm: "要匯入 ${count} 首歌曲嗎？這將取代你目前的播放清單。",
    importSuccess: "已成功匯入 ${count} 首歌曲！",
    darkModeStatus: "深色模式已${status}。",
    albumArtSpinStatus: "專輯封面旋轉已${status}。",
    lyricsPanelStatus: "歌詞面板已${status}。",
    languageSet: "語言已設定為 ${language}。",
    enabled: "啟用",
    disabled: "停用",
    chinese: "簡體中文",
    english: "英文",
    addToPlaylist: "加入播放清單",
    add: "加入",
    invalidLink: "⚠ 提供的 YouTube 連結無效。",
    duplicateSong: "⚠ 此歌曲已在你的播放清單中！",
    addedSong: (title, author) => `✅ 已將「${title}」－${author} 加入你的播放清單！`,
    aboutTitle: "關於 YouTube 音樂播放器",
    aboutDescription: "一個功能豐富的網頁音樂播放器，以 YouTube 作為音樂來源。你可以透過簡潔直覺的介面播放、管理和整理喜愛的音樂。",
    featuresTitle: "功能",
    feature1: "YouTube 音樂播放",
    feature2: "支援拖放排序的播放清單管理",
    feature3: "支援自動同步的歌詞顯示",
    feature4: "歌詞翻譯",
    feature5: "深色/淺色模式",
    feature6: "匯出/匯入播放清單",
    feature7: "音量控制與進度列",
    feature8: "多語言支援（{languages}）",
    feature9: "自動播放與重複播放模式",
    originalProjectTitle: "原始專案",
    originalCreator: "原始創作者",
    contributorsTitle: "貢獻者",
    forkMaintainer: "分支維護者",
    linksTitle: "連結",
    originalRepository: "原始儲存庫",
    versionInfoTitle: "版本資訊",
    version: "版本：",
    lastUpdated: "最後更新：",
    languages: "語言：",
    experimentalFeatures: "實驗性功能",
    settingsAboutTitle: "關於此專案",
    settingsAbout: "關於",
    albumArtDisplay: "專輯封面顯示：",
    spin: "旋轉",
    none: "無",
    video: "影片",
    youtubeApi403Error: "YouTube API 錯誤：403 - 已超過配額。此 API 金鑰已達到每日限制。請明天再試，或使用其他 API 金鑰。",
    translationStatus: "歌詞翻譯已${status}。",
    enableLyricsTranslation: "歌詞翻譯",
    showOriginalFirstLabel: "優先顯示原文",
    noResultsFound: "找不到結果。",
    searchCache: "搜尋快取",
    lyricsCache: "歌詞快取",
    translationCache: "翻譯快取",
    unknown: "未知",
    viewDetails: "查看詳細資料",
    delete: "刪除",
    noCacheItems: "找不到快取項目",
    totalItems: "項目總數",
    totalSize: "總大小",
    selectAll: "全選",
    clearSelected: "清除已選項目",
    clearAll: "清除所有快取",
    cacheManagerTitle: "快取管理員",
    cacheItems: "快取項目",
    cacheKey: "快取金鑰",
    cacheType: "類型",
    cacheSize: "大小",
    cacheAge: "快取時間",
    actions: "操作",
    confirmDeleteSelected: "要刪除已選取的 {count} 個項目嗎？",
    confirmDeleteItem: "要刪除此快取項目嗎？",
    confirmClearAllCache: "確定要清除所有快取嗎？此操作無法復原。",
    noItemsSelected: "尚未選取任何項目",
    copiedToClipboard: "已複製到剪貼簿！",
    cacheItemDetails: "快取詳細資料",
    cacheContent: "內容",
    copyContent: "複製內容",
    deleteItem: "刪除項目",
    close: "關閉",
    search: "搜尋",
    translation: "翻譯",
    all: "全部",
    itemsSelected: "已選取 {count} 個項目",
    cacheStats: "快取統計資料",
    expiresIn: "到期時間",
    never: "永不",
    expired: "已過期",
    valid: "有效",
    invalid: "無效",
    en: "英文",
    zh: "簡體中文",
    "zh-TW": "繁體中文",
    ja: "日文",
    ko: "韓文",
  }
};

let currentLang = localStorage.getItem("language");

if (!translations[currentLang]) {
    const browserLang = navigator.language.toLowerCase();

    if (
        browserLang.includes("zh-tw") ||
        browserLang.includes("zh-hk") ||
        browserLang.includes("zh-mo") ||
        browserLang.includes("hant")
    ) {
        currentLang = "zh-TW";
    } else if (browserLang.includes("zh")) {
        currentLang = "zh";
    } else if (browserLang.includes("ja")) {
        currentLang = "ja";
    } else if (browserLang.includes("ko")) {
        currentLang = "ko";
    } else {
        currentLang = "en";
    }

    localStorage.setItem("language", currentLang);
}

function updateLanguageButtons() {
    const languageSelect = document.getElementById("languageSelect");
    if (!languageSelect) return;

    const t = translations[currentLang] || translations.en;

    // Show the currently selected language
    languageSelect.value = currentLang;
}

function updateSupportedLanguages() {
    const languageSelect = document.getElementById("languageSelect");
    const supportedLanguages = document.getElementById("supportedLanguages");

    if (!languageSelect || !supportedLanguages) return;

    const t = translations[currentLang] || translations.en;

    const languages = Array.from(languageSelect.options)
        .map(option => t[option.value] || option.value);

    supportedLanguages.textContent = languages.length > 1
        ? `${languages.slice(0, -1).join(", ")} & ${languages.at(-1)}`
        : languages[0] || "";
}

function getFeatureLanguageSeparator(lang = currentLang) {
    const separators = {
        en: " / ",
        zh: "/",
        "zh-TW": "/",
        ja: "／",
        ko: " / "
    };

    return separators[lang] || " / ";
}

function getFeatureLanguageList() {
    const languageSelect = document.getElementById("languageSelect");
    const t = translations[currentLang] || translations.en;

    if (!languageSelect) return "";

    return Array.from(languageSelect.options)
        .map(option => t[option.value] || option.textContent)
        .join(getFeatureLanguageSeparator());
}

function updateFeature8() {
    const feature8Element = document.querySelector('[data-translate="feature8"]');
    const t = translations[currentLang] || translations.en;

    if (!feature8Element || !t.feature8) return;

    feature8Element.textContent = t.feature8.replace(
        "{languages}",
        getFeatureLanguageList()
    );
}

function applyLanguage(lang = currentLang) {
    currentLang = translations[lang] ? lang : "en";
    localStorage.setItem("language", currentLang);

    const t = translations[currentLang];
    updateLanguageButtons();
    updateSupportedLanguages();

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

    if (shouldTranslateLyricsNow() && lyricsData && lyricsState.status !== "loading") {
        const title = lyricsState.title;
        const artist = lyricsState.artist;
        if (title && artist) {
            // Show loading message for translation
            const meta = document.getElementById("lyricsMeta");
            const textEl = document.getElementById("lyricsText");
            
            if (lyricsState.status === "synced") {
                meta.textContent = `${t.lyricsSyncedFound} ${artist} – ${title}`;
            } else if (lyricsState.status === "plain") {
                meta.textContent = `${t.lyricsPlainFound} ${artist} – ${title}`;
            }
            
            requestLyricsForCurrentSong({ force: true });
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
        } else if (currentErrorText.includes("API Key is not configured") || currentErrorText.includes("YOUR_YOUTUBE_API_KEY")) {
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

    refreshBuildDateLanguage();
    updateFeature8();
}

document.getElementById("languageSelect")?.addEventListener("change", function () {
  applyLanguage(this.value);
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
function formatBuildDateByLanguage(date, lang = currentLang) {
    if (!(date instanceof Date) || isNaN(date.getTime())) return "";

    const localeMap = {
        en: "en-US",
        zh: "zh-CN",
        "zh-TW": "zh-TW",
        ja: "ja-JP",
        ko: "ko-KR"
    };

    const locale = localeMap[lang] || "en-US";

    return new Intl.DateTimeFormat(locale, {
        year: "numeric",
        month: "long",
        day: "numeric"
    }).format(date);
}

function refreshBuildDateLanguage() {
    const dateElement = document.getElementById("formattedDate");
    if (!dateElement) return;

    const isoDate = dateElement.getAttribute("data-build-date");
    if (!isoDate) return;

    const date = new Date(isoDate);
    dateElement.textContent = formatBuildDateByLanguage(date, currentLang);
}

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

    if (latestDate) {
        dateElement.setAttribute("data-build-date", latestDate.toISOString());

        // Keep old format also, in case your other code still uses data-original-date
        const day = latestDate.getDate();
        const month = latestDate.getMonth() + 1;
        const year = latestDate.getFullYear();
        dateElement.setAttribute("data-original-date", `${day}d ${month}m ${year}y`);
    } else {
        if (!dateElement.getAttribute("data-build-date")) {
            const fallbackDate = new Date(2026, 5, 19); // 19 June 2026
            dateElement.setAttribute("data-build-date", fallbackDate.toISOString());
            dateElement.setAttribute("data-original-date", "19d 6m 2026y");
        }
    }

    // Update date text using current selected language
    refreshBuildDateLanguage();
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
function getLyricsTargetLanguage() {
    return ["en", "zh", "zh-TW", "ja", "ko"].includes(currentLang)
        ? currentLang
        : "en";
}

function getLyricsLabels() {
    const labels = {
        en: { original: "Original", translation: "Translation" },
        zh: { original: "原文", translation: "译文" },
        "zh-TW": { original: "原文", translation: "譯文" },
        ja: { original: "原文", translation: "翻訳" },
        ko: { original: "원문", translation: "번역" }
    };

    return labels[getLyricsTargetLanguage()] || labels.en;
}

async function translateLyrics(text, sourceLang = "auto", targetLang = getLyricsTargetLanguage(), signal = null ) {
    throwIfLyricsAborted(signal);
    // Check cache first
    const cacheKey = `${sourceLang}-${targetLang}-${text.substring(0, 100)}`;
    const cached = translationCache[cacheKey];
    
    if (cached && (Date.now() - cached.timestamp < TRANSLATION_CACHE_EXPIRY)) {
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
                const translatedLine = await translateSingleLine(line, sourceLang, targetLang, null, signal);
                translatedLines.push(translatedLine);
            } catch (error) {
                console.log(`Failed to translate line: "${line}", using original`);
                translatedLines.push(line);
            }
            
            await delayWithSignal(100, signal);
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
    return await translateSingleLine(text, sourceLang, targetLang, cacheKey, signal );
}

async function translateSingleLine(text, sourceLang, targetLang, cacheKey = null, signal = null ) {
    throwIfLyricsAborted(signal);
    const translationServices = [
        // Service 1: LibreTranslate (primary)
        async (text, source, target, signal) => {
            try {
                // LibreTranslate language codes mapping
                const libreCodes = {
                    'en': 'en',
                    'zh': 'zh',
                    'zh-TW': 'zh-TW',
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
                    signal,
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
        async (text, source, target, signal) => {
            try {
                // MyMemory API uses language codes like "en" for English, "zh-CN" for Chinese
                const myMemorySource = source === 'zh' ? 'zh-CN' :
                                    source === 'zh-TW' ? 'zh-TW' :
                                    source === 'ja' ? 'ja' :
                                    source === 'ko' ? 'ko' : source;

                const myMemoryTarget = target === 'zh' ? 'zh-CN' :
                                    target === 'zh-TW' ? 'zh-TW' :
                                    target === 'ja' ? 'ja' :
                                    target === 'ko' ? 'ko' : target;
                
                const response = await fetch(
                    `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${myMemorySource}|${myMemoryTarget}`,
                    { signal }
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
        async (text, source, target, signal) => {
            try {
                const googleLangCodes = {
                    'en': 'en',
                    'zh': 'zh-CN',
                    'zh-TW': 'zh-TW',
                    'ja': 'ja',
                    'ko': 'ko'
                };
                
                const googleSource = googleLangCodes[source] || source;
                const googleTarget = googleLangCodes[target] || target;
                
                // Use a public Google Translate proxy
                const response = await fetch(
                    `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${googleSource}&tl=${googleTarget}&dt=t&q=${encodeURIComponent(text)}`,
                    { signal }
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
            const translatedText = await translationServices[i](text, sourceLang, targetLang, signal);
            
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

function detectLanguage(text = "") {
    const japaneseKanaCount = (text.match(/[\u3040-\u309F\u30A0-\u30FF]/g) || []).length;
    const koreanCount = (text.match(/[\uAC00-\uD7AF]/g) || []).length;

    // Common Traditional-only Chinese characters
    const traditionalChineseCount = (
        text.match(/[體語漢譯樂詞載顯設數據導開關閉啟後時過畫實驗穩險鑰讀寫應統計總類為這個會無與專業東兩嚴喪豐麗舉麼義烏喬習鄉書買亂爭於虧雲亞產親億僅從倉儀們價眾優傳傷偉側偵俠僑儲兒兌黨蘭興養獸內岡冊軍農衝決況凍淨涼減湊鳳憑凱擊劃劉則剛創刪別劑劍劇勸辦務動勵勁勞勢區醫華協單賣衛卻廠廳歷壓厭厲廁廈廚縣參雙變敘疊葉號嘆聽吳員響啞嘩喚嘖嘯噴團園圍圖圓聖場壞塊堅壇壩墳墜壘墾墊墮牆壯聲殼壺處備復夠頭夾奪奮獎奧妝婦媽嬌娛孫學寧寶審宮寬賓對尋將爾塵嘗盡層屬歲豈島嶺峽巒]/g) || []
    ).length;

    const chineseHanCount = (text.match(/[\u4E00-\u9FFF]/g) || []).length;

    if (japaneseKanaCount > 0) return "ja";
    if (koreanCount > 0) return "ko";
    if (traditionalChineseCount > 0) return "zh-TW";
    if (chineseHanCount > 0) return "zh";

    return "en";
}

async function translateLyricsLines(lines, targetLang, signal = null) {
    throwIfLyricsAborted(signal);

    const sourceLang = detectLanguage(
        lines.map(line => line.text).join(" ")
    );

    if (sourceLang === targetLang) {
        return lines.map(line => line.text);
    }

    const translatedLines = [];

    for (let i = 0; i < lines.length; i += 5) {
        throwIfLyricsAborted(signal);

        const chunk = lines.slice(i, i + 5);

        const nonEmptyItems = chunk
            .map((line, index) => ({
                index,
                text: (line.text || "").trim()
            }))
            .filter(item => item.text !== "");

        if (nonEmptyItems.length === 0) {
            translatedLines.push(...chunk.map(() => ""));
            continue;
        }

        const chunkText = nonEmptyItems
            .map(item => item.text)
            .join("\n");

        try {
            let translatedChunk;

            const sourceIsCJK = ["zh", "ja", "ko"].includes(sourceLang);
            const targetIsCJK = ["zh", "ja", "ko"].includes(targetLang);

            if (sourceIsCJK && targetIsCJK && sourceLang !== targetLang) {
                const englishChunk = await translateLyrics(
                    chunkText,
                    sourceLang,
                    "en",
                    signal
                );

                throwIfLyricsAborted(signal);

                translatedChunk = await translateLyrics(
                    englishChunk,
                    "en",
                    targetLang,
                    signal
                );
            } else {
                translatedChunk = await translateLyrics(
                    chunkText,
                    sourceLang,
                    targetLang,
                    signal
                );
            }

            throwIfLyricsAborted(signal);

            const translatedLinesChunk = translatedChunk.split("\n");
            const chunkResult = Array(chunk.length).fill("");

            nonEmptyItems.forEach((item, translationIndex) => {
                chunkResult[item.index] =
                    (translatedLinesChunk[translationIndex] || item.text).trim();
            });

            translatedLines.push(...chunkResult);
        } catch (error) {
            if (isAbortError(error)) {
                throw error;
            }

            translatedLines.push(...chunk.map(line => line.text));
        }

        await delayWithSignal(100, signal);
    }

    return translatedLines;
}

function renderLrcLinesWithTranslation(lines, translatedLines = []) {
    const el = document.getElementById("lyricsText");
    const labels = getLyricsLabels();

    el.innerHTML = lines.map((line, index) => {
        const original = (line.text || "").trim();
        const translation = (translatedLines[index] || "").trim();

        // Remove a row only when both original and translation are empty.
        if (!original && !translation) return "";

        const minutes = Math.floor(line.time / 60);
        const seconds = Math.floor(line.time % 60);
        const formattedTime = `${minutes}:${seconds < 10 ? "0" + seconds : seconds}`;

        // Only one usable text: show one section only.
        const hasBothTexts =
            original !== "" &&
            translation !== "" &&
            original !== translation;

        if (!hasBothTexts) {
            const text = original || translation;
            const className = original ? "original-lyric" : "translated-lyric";
            const label = original ? labels.original : labels.translation;

            return `
                <div class="lrc-line"
                     data-index="${index}"
                     data-time="${line.time}"
                     data-formatted-time="${formattedTime}">
                    <div class="lyrics-pair">
                        <div class="${className}" data-label="${label}">
                            ${text}
                        </div>
                    </div>
                </div>
            `;
        }

        const firstIsOriginal = showOriginalFirst;
        const firstText = firstIsOriginal ? original : translation;
        const firstClass = firstIsOriginal ? "original-lyric" : "translated-lyric";
        const firstLabel = firstIsOriginal ? labels.original : labels.translation;

        const secondText = firstIsOriginal ? translation : original;
        const secondClass = firstIsOriginal ? "translated-lyric" : "original-lyric";
        const secondLabel = firstIsOriginal ? labels.translation : labels.original;

        return `
            <div class="lrc-line"
                 data-index="${index}"
                 data-time="${line.time}"
                 data-formatted-time="${formattedTime}">

                <div class="lyrics-pair">
                    <div class="${firstClass}" data-label="${firstLabel}">
                        ${firstText}
                    </div>

                    <div class="${secondClass}" data-label="${secondLabel}">
                        ${secondText}
                    </div>
                </div>
            </div>
        `;
    }).join("");
}

function renderPlainLyricsWithTranslation(plainText, translatedText = "") {
    const el = document.getElementById("lyricsText");
    const labels = getLyricsLabels();

    const originalLines = plainText.split(/\r?\n/);
    const translatedLines = translatedText
        ? translatedText.split(/\r?\n/)
        : [];

    el.innerHTML = originalLines.map((line, index) => {
        const original = (line || "").trim();
        const translation = (translatedLines[index] || "").trim();

        // Do not create a blank lyric section.
        if (!original && !translation) return "";

        const hasBothTexts =
            original !== "" &&
            translation !== "" &&
            original !== translation;

        // Show only one section when only original or translation exists.
        if (!hasBothTexts) {
            const text = original || translation;
            const className = original ? "original-lyric" : "translated-lyric";
            const label = original ? labels.original : labels.translation;

            return `
                <div class="plain-line">
                    <div class="lyrics-pair">
                        <div class="${className}" data-label="${label}">
                            ${text}
                        </div>
                    </div>
                </div>
            `;
        }

        const firstIsOriginal = showOriginalFirst;
        const firstText = firstIsOriginal ? original : translation;
        const firstClass = firstIsOriginal ? "original-lyric" : "translated-lyric";
        const firstLabel = firstIsOriginal ? labels.original : labels.translation;

        const secondText = firstIsOriginal ? translation : original;
        const secondClass = firstIsOriginal ? "translated-lyric" : "original-lyric";
        const secondLabel = firstIsOriginal ? labels.translation : labels.original;

        return `
            <div class="plain-line">
                <div class="lyrics-pair">
                    <div class="${firstClass}" data-label="${firstLabel}">
                        ${firstText}
                    </div>

                    <div class="${secondClass}" data-label="${secondLabel}">
                        ${secondText}
                    </div>
                </div>
            </div>
        `;
    }).join("");
}

function initLyricsClickToSeek() {
    const lyricsContainer = document.getElementById("lyricsText");

    lyricsContainer.addEventListener("click", function (e) {
        let target = e.target;

        while (
            target &&
            !target.classList.contains("lrc-line") &&
            target !== lyricsContainer
        ) {
            target = target.parentElement;
        }

        if (
            !target ||
            !target.classList.contains("lrc-line") ||
            !lyricsData ||
            !lyricsData.isLrc ||
            !player ||
            typeof player.seekTo !== "function"
        ) {
            return;
        }

        // The LRC timestamp stored on the clicked lyric line.
        const lyricTime = Number(target.getAttribute("data-time"));
        if (!Number.isFinite(lyricTime)) return;

        // Apply the same per-song offset logic used by auto-sync.
        const currentSong = getCurrentSongObject();
        const lyricsTimeOffset = Number(currentSong?.lyricsTimeOffset);
        const safeOffset = Number.isFinite(lyricsTimeOffset)
            ? lyricsTimeOffset
            : 0;

        // Auto-sync uses: playerTime + offset.
        // Therefore, clicking an LRC line must seek to: lyricTime - offset.
        const seekTime = Math.max(0, lyricTime - safeOffset);

        player.seekTo(seekTime, true);

        // Update the UI immediately.
        target.classList.add("clicked");
        setTimeout(() => {
            target.classList.remove("clicked");
        }, 300);

        const duration = player.getDuration();
        if (duration > 0) {
            const progressPercent = (seekTime / duration) * 100;

            document.getElementById("progress").style.width =
                `${progressPercent}%`;

            document.getElementById("currentTime").innerText =
                formatTime(seekTime);
        }

        // Immediately update the lyric highlight.
        syncLyricsToTime(seekTime);
    });
}

// Initialize click-to-seek on DOM ready
document.addEventListener("DOMContentLoaded", function() {
    initLyricsClickToSeek();
});

async function loadLyricsFor(
    title,
    artist,
    { force = false, videoId = actualSelectedVideoId || selectedVideoId } = {}
) {
    if (!videoId || !shouldFetchLyricsNow(force)) {
        return;
    }

    if (
        !force &&
        lyricsData &&
        lyricsState.videoId === videoId
    ) {
        if (isLyricsPageVisible()) {
            startLyricsSync();
        }

        return;
    }

    stopLyricsJobs();

    lyricsFetchController = new AbortController();

    const job = {
        version: ++lyricsRequestVersion,
        videoId,
        signal: lyricsFetchController.signal
    };

    const cleaned = cleanTitleAndArtist(title, artist);

    try {
        await fetchLyricsWithTranslation(
            cleaned.track,
            cleaned.artist,
            job
        );

        if (isCurrentLyricsJob(job) && isLyricsPageVisible()) {
            startLyricsSync();
        }
    } catch (error) {
        if (isAbortError(error) || !isCurrentLyricsJob(job)) {
            return;
        }

        console.error("Lyrics loading error:", error);

        lyricsData = null;
        translatedLyrics = null;

        lyricsState = {
            status: "error",
            artist: cleaned.artist,
            title: cleaned.track,
            videoId
        };

        document.getElementById("lyricsMeta").textContent =
            translations[currentLang].lyricsError;

        document.getElementById("lyricsText").textContent =
            translations[currentLang].lyricsError;
    } finally {
        if (lyricsFetchController?.signal === job.signal) {
            lyricsFetchController = null;
        }
    }
}

async function fetchLyricsWithTranslation(title, artist, job) {
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
            useCachedLyrics = true;
        } else if (json.noLyrics) {
            // We've already determined no lyrics exist for this song
            throw new Error("No lyrics (cached)");
        }
        } catch (e) {
        console.warn("Failed to parse cached lyrics:", e);
        }
    }

    const meta = document.getElementById("lyricsMeta");
    const textEl = document.getElementById("lyricsText");
    const t = translations[currentLang];
    const isCurrent = () => isCurrentLyricsJob(job);
    const targetLang = getLyricsTargetLanguage();

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
        if (!isCurrent()) {
            return;
        }

        // If no lyrics found, try CJK-only artist
        if (!json.syncedLyrics && !json.plainLyrics) {
            const cjkOnlyArtist = artist.replace(/[\u0020A-Za-z]+/g, "").trim();
            if (cjkOnlyArtist && cjkOnlyArtist !== artist) {
            console.log("Retrying with CJK only:", cjkOnlyArtist);
            json = await tryFetch(cjkOnlyArtist, title);
            json = await tryFetch(artist, title);
            if (json.syncedLyrics || json.plainLyrics) {
                artist = cjkOnlyArtist; // Update to working version
            }
            }
        }
        }

        const lyrics = json.syncedLyrics || json.plainLyrics;
        if (!lyrics) throw new Error("No lyrics");

        const sourceLang = detectLanguage(lyrics);
        const shouldTranslate = shouldTranslateLyricsNow() && sourceLang !== targetLang;

        // Clear old translation from the previous song or previous language.
        translatedLyrics = null;
        showTranslatedView = false;
        isTranslating = false;

        const isLrc = /^\s*\[\d{1,2}:\d{2}/m.test(lyrics);
        
        // Show normal lyrics first (immediately)
        if (isLrc) {
        const parsed = parseLrc(lyrics);
        lyricsData = { isLrc: true, lrcLines: parsed };
        
        renderLrcLines(parsed);
        meta.textContent = `${t.lyricsSyncedFound} ${artist} – ${title}`;
        lyricsState = {
            status: "synced",
            artist,
            title,
            videoId: job.videoId
        };
        
        // Then translate in background if enabled
        if (shouldTranslate && !isTranslating) {
            isTranslating = true;
            
            // Check for cached translation
            let useCachedTranslation = false;
            const cachedTranslation = localStorage.getItem(translationCacheKey);
            if (cachedTranslation) {
            try {
                const translationData = JSON.parse(cachedTranslation);
                if (translationData.translation && Date.now() - translationData.timestamp < TRANSLATION_CACHE_EXPIRY) {
                translatedLyrics = translationData.translation;
                useCachedTranslation = true;
                showTranslatedView = true;
                }
            } catch (e) {
                console.warn("Failed to parse cached translation:", e);
            }
            }
            
            if (!useCachedTranslation) {
            meta.textContent = `${t.lyricsSyncedFound} ${artist} – ${title}`;
            
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
                    renderLrcLinesWithTranslation(parsed, translatedLyrics);
                    meta.textContent = `${t.lyricsSyncedFound} ${artist} – ${title}`;
                    showTranslatedView = true;
                } else {
                    // No translation available, keep normal view
                    meta.textContent = `${t.lyricsSyncedFound} ${artist} – ${title}`;
                }
                } catch (translationError) {
                console.error("Translation failed:", translationError);
                // Keep normal lyrics view
                meta.textContent = `${t.lyricsSyncedFound} ${artist} – ${title}`;
                } finally {
                isTranslating = false;
                }
            }, 100);
            } else {
            // Use cached translation immediately
            const hasTranslation = translatedLyrics && 
                translatedLyrics.some((line, i) => line !== parsed[i].text);
            
            if (hasTranslation) {
                renderLrcLinesWithTranslation(parsed, translatedLyrics);
                meta.textContent = `${t.lyricsSyncedFound} ${artist} – ${title}`;
            }
            isTranslating = false;
            }
        }
        } else {
        // Plain lyrics (non-synced)
        lyricsData = { isLrc: false, plain: lyrics };
        
        const lines = lyrics.split(/\r?\n/).filter(l => l.trim().length > 0);
        textEl.innerHTML = lines.map(line => `<div class="plain-line">${line}</div>`).join("");
        meta.textContent = `${t.lyricsPlainFound} ${artist} – ${title}`;
        lyricsState = {
            status: "plain",
            artist,
            title,
            videoId: job.videoId
        };
        
        // Then translate in background if enabled
        if (shouldTranslate && !isTranslating) {
            isTranslating = true;
            
            // Check for cached translation
            const cacheKey = `${title}-${artist}-${targetLang}-plain`;
            let useCachedTranslation = false;
            
            if (translationCache[cacheKey] && translationCache[cacheKey].translation) {
            translatedLyrics = translationCache[cacheKey].translation;
            useCachedTranslation = true;
            }
            
            if (!useCachedTranslation) {
            meta.textContent = `${t.lyricsPlainFound} ${artist} – ${title}`;
            
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
                    renderPlainLyricsWithTranslation(lyrics, translatedLyrics);
                    meta.textContent = `${t.lyricsPlainFound} ${artist} – ${title}`;
                    showTranslatedView = true;
                } else {
                    // No translation available, keep normal view
                    meta.textContent = `${t.lyricsPlainFound} ${artist} – ${title}`;
                }
                } catch (translationError) {
                console.error("Translation failed:", translationError);
                // Keep normal lyrics view
                meta.textContent = `${t.lyricsPlainFound} ${artist} – ${title}`;
                } finally {
                isTranslating = false;
                }
            }, 100);
            } else {
            // Use cached translation immediately
            const hasTranslation = translatedLyrics && translatedLyrics !== lyrics;
            
            if (hasTranslation) {
                renderPlainLyricsWithTranslation(lyrics, translatedLyrics);
                meta.textContent = `${t.lyricsPlainFound} ${artist} – ${title}`;
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

    const currentSong = getCurrentSongObject();

    const lyricsTimeOffset = Number(currentSong?.lyricsTimeOffset);
    const safeOffset = Number.isFinite(lyricsTimeOffset)
        ? lyricsTimeOffset
        : 0;

    // Positive = lyrics display earlier.
    // Negative = lyrics display later.
    currentTime = Math.max(0, currentTime + safeOffset);
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

// Load translation setting on startup
translationEnabled = JSON.parse(localStorage.getItem("translationEnabled") || "false");
if (document.getElementById("translationToggle")) {
    document.getElementById("translationToggle").checked = translationEnabled;
}

document.addEventListener("DOMContentLoaded", () => {
    const translationToggle = document.getElementById("translationToggle");

    translationEnabled =
        localStorage.getItem("translationEnabled") === "true";

    if (!translationToggle) {
        return;
    }

    translationToggle.checked = translationEnabled;

    translationToggle.addEventListener("change", function () {
        translationEnabled = this.checked;

        localStorage.setItem(
            "translationEnabled",
            String(translationEnabled)
        );

        cancelActiveTranslation();

        // Show only original lyrics when translation is switched off.
        if (!translationEnabled && lyricsData) {
            translatedLyrics = null;
            showTranslatedView = false;

            if (lyricsData.isLrc) {
                renderLrcLines(lyricsData.lrcLines);
            } else {
                const lines = lyricsData.plain
                    .split(/\r?\n/)
                    .filter(line => line.trim());

                document.getElementById("lyricsText").innerHTML =
                    lines.map(
                        line => `<div class="plain-line">${line}</div>`
                    ).join("");
            }

            return;
        }

        // Only start translation while the Lyrics page is visible.
        if (translationEnabled && isLyricsPageVisible()) {
            requestLyricsForCurrentSong({ force: true });
        }
    });
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
    
    // Close cache manager without triggering the Settings outside-click handler
    cacheManagerCloseBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        closeCacheManager();
    });

    cacheManagerOverlay.addEventListener("click", function (e) {
        e.stopPropagation();
        closeCacheManager();
    });

    // Prevent clicks inside Cache Manager from closing Settings
    cacheManagerWindow.addEventListener("click", function (e) {
        e.stopPropagation();
    });
    
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

// ========== TITLE SCROLL ANIMATION ==========

const SLIDE_DURATION = 5; // Initial waiting time before scrolling
const PAUSE_DURATION = 2; // Pause after one full scroll
const TITLE_SCROLL_SPEED_KEY = "titleScrollSpeed";
const DEFAULT_TITLE_SCROLL_SPEED = 50;
const MIN_TITLE_SCROLL_SPEED = 10;
const MAX_TITLE_SCROLL_SPEED = 150;

const savedTitleScrollSpeed = localStorage.getItem(
    TITLE_SCROLL_SPEED_KEY
);

let TITLE_SCROLL_SPEED = savedTitleScrollSpeed === null ? DEFAULT_TITLE_SCROLL_SPEED : Number(savedTitleScrollSpeed);

if (!Number.isFinite(TITLE_SCROLL_SPEED) || TITLE_SCROLL_SPEED < MIN_TITLE_SCROLL_SPEED || TITLE_SCROLL_SPEED > MAX_TITLE_SCROLL_SPEED) {
    TITLE_SCROLL_SPEED = DEFAULT_TITLE_SCROLL_SPEED;

    localStorage.setItem(TITLE_SCROLL_SPEED_KEY, String(TITLE_SCROLL_SPEED));
}

const TITLE_GAP_FRACTION_KEY = "titleGapFraction";
const DEFAULT_GAP_FRACTION = 0.3;

let GAP_FRACTION;

if (localStorage.getItem(TITLE_GAP_FRACTION_KEY) === null) {
    GAP_FRACTION = DEFAULT_GAP_FRACTION;

    localStorage.setItem(
        TITLE_GAP_FRACTION_KEY,
        String(GAP_FRACTION)
    );
} else {
    GAP_FRACTION = Number(localStorage.getItem(TITLE_GAP_FRACTION_KEY));

    // Repair an invalid saved value.
    if (!Number.isFinite(GAP_FRACTION)) {
        GAP_FRACTION = DEFAULT_GAP_FRACTION;
        localStorage.setItem(
            TITLE_GAP_FRACTION_KEY,
            String(GAP_FRACTION)
        );
    }
}

function setTitleGapFraction(value) {
    const parsedValue = Number(value);

    if (!Number.isFinite(parsedValue)) return false;

    // Allow 0% to 100% of the title container width.
    GAP_FRACTION = Math.max(0, Math.min(1, parsedValue));

    localStorage.setItem(
        TITLE_GAP_FRACTION_KEY,
        String(GAP_FRACTION)
    );

    // Apply the new gap immediately to a scrolling title.
    stopTitleAnimation();
    stopAuthorAnimation();

    requestAnimationFrame(() => {
        startTitleAnimation();
        startAuthorAnimation();
    });

    return true;
}

function setTitleScrollSpeed(value) {
    const parsedValue = Number(value);

    if (!Number.isFinite(parsedValue)) {
        return false;
    }

    TITLE_SCROLL_SPEED = Math.round(
        Math.max(
            MIN_TITLE_SCROLL_SPEED,
            Math.min(MAX_TITLE_SCROLL_SPEED, parsedValue)
        )
    );

    localStorage.setItem(
        TITLE_SCROLL_SPEED_KEY,
        String(TITLE_SCROLL_SPEED)
    );

    // Restart both animations so the new speed applies immediately.
    stopTitleAnimation();
    stopAuthorAnimation();

    requestAnimationFrame(() => {
        startTitleAnimation();
        startAuthorAnimation();
    });

    return true;
}

const titleContainer = document.querySelector("#nowPlaying .song-title");
const titleInner = document.querySelector("#nowPlaying .song-title-inner");
let titleAnimationRunning = false;

function updateSongTitle(text) {
    if (!titleInner) return;
    const safeText = text || " ";
    titleInner.innerHTML = '';
    const span1 = document.createElement('span');
    span1.className = 'title-copy first-copy';
    span1.textContent = safeText;
    titleInner.appendChild(span1);
    const span2 = document.createElement('span');
    span2.className = 'title-copy second-copy';
    span2.textContent = safeText;
    // margin-left will be set in startTitleAnimation after measuring
    titleInner.appendChild(span2);

    stopTitleAnimation();
    requestAnimationFrame(() => {
        startTitleAnimation();
    });
}

function stopTitleAnimation() {
    titleAnimationRunning = false;
    if (titleInner) {
        titleInner.style.transition = 'none';
        titleInner.style.transform = 'translateX(0)';
        // Reset second copy's margin (will be recalculated on next start)
        const secondCopy = titleInner.querySelector('.second-copy');
        if (secondCopy) {
            secondCopy.style.marginLeft = '0';
        }
        void titleInner.offsetWidth;
        titleInner.style.transition = '';
    }
}

function startTitleAnimation() {
    if (!titleInner || !titleContainer) return;
    const copies = titleInner.querySelectorAll('.title-copy');
    if (copies.length < 2) return;

    const firstCopy = copies[0];
    const secondCopy = copies[1];
    const text = firstCopy.textContent.trim();
    if (!text) {
        titleInner.style.transform = 'translateX(0)';
        return;
    }

    const containerWidth = titleContainer.offsetWidth;
    firstCopy.style.whiteSpace = 'nowrap';
    const oneCopyWidth = firstCopy.offsetWidth;

    if (oneCopyWidth <= containerWidth) {
        secondCopy.style.display = 'none';
        titleInner.style.transform = 'translateX(0)';
        return;
    }

    secondCopy.style.display = 'inline-block';
    const gap = Math.max(10, Math.min(containerWidth * GAP_FRACTION, oneCopyWidth * 0.5));
    secondCopy.style.marginLeft = gap + 'px';

    const totalSlideDistance = oneCopyWidth + gap;
    const totalSlideDuration = totalSlideDistance / TITLE_SCROLL_SPEED;

    if (titleAnimationRunning) return;
    titleAnimationRunning = true;

    let startTime = null;
    let phase = 'initialPause';   // Changed
    let pauseStartTime = null;

    function animate(timestamp) {
        if (!startTime) startTime = timestamp;
        const elapsed = (timestamp - startTime) / 1000;

        if (phase === 'initialPause') {
            if (elapsed >= SLIDE_DURATION) {
                phase = 'slide';
                startTime = timestamp;
            }
            titleInner.style.transform = 'translateX(0)';
        }
        else if (phase === 'slide') {
            const progress = Math.min(elapsed / totalSlideDuration, 1);
            const translateX = -progress * totalSlideDistance;
            titleInner.style.transform = `translateX(${translateX}px)`;

            if (progress >= 1) {
                phase = 'pause';
                pauseStartTime = timestamp;
            }
        }
        else if (phase === 'pause') {
            const pauseElapsed = (timestamp - pauseStartTime) / 1000;
            if (pauseElapsed >= PAUSE_DURATION) {
                titleInner.style.transition = 'none';
                titleInner.style.transform = 'translateX(0)';
                void titleInner.offsetWidth;
                titleInner.style.transition = '';
                startTime = timestamp;
                phase = 'slide';
            }
        }

        if (titleAnimationRunning) {
            requestAnimationFrame(animate);
        }
    }

    requestAnimationFrame(animate);
}

let resizeTimeout;
const authorContainer = document.querySelector("#nowPlaying .author-name");
const authorInner = document.querySelector("#nowPlaying .author-name-inner");

let authorAnimationRunning = false;
let authorAnimationToken = 0;

function updateAuthorName(text) {
    if (!authorContainer || !authorInner) return;

    const safeText = text || "";

    authorContainer.dataset.author = safeText;

    stopAuthorAnimation();
    authorInner.innerHTML = "";

    if (!safeText) return;

    const firstCopy = document.createElement("span");
    firstCopy.className = "author-copy first-copy";
    firstCopy.textContent = safeText;

    const secondCopy = document.createElement("span");
    secondCopy.className = "author-copy second-copy";
    secondCopy.textContent = safeText;

    authorInner.append(firstCopy, secondCopy);

    requestAnimationFrame(startAuthorAnimation);
}

function stopAuthorAnimation() {
    authorAnimationRunning = false;
    authorAnimationToken++;

    if (!authorInner) return;

    authorInner.style.transition = "none";
    authorInner.style.transform = "translateX(0)";

    const secondCopy = authorInner.querySelector(".second-copy");
    if (secondCopy) {
        secondCopy.style.marginLeft = "0";
    }

    void authorInner.offsetWidth;
    authorInner.style.transition = "";
}

function startAuthorAnimation() {
    if (!authorContainer || !authorInner) return;

    const copies = authorInner.querySelectorAll(".author-copy");
    if (copies.length < 2) return;

    const firstCopy = copies[0];
    const secondCopy = copies[1];
    const text = firstCopy.textContent.trim();

    if (!text) return;

    const containerWidth = authorContainer.offsetWidth;
    const oneCopyWidth = firstCopy.offsetWidth;

    if (oneCopyWidth <= containerWidth) {
        secondCopy.style.display = "none";
        authorInner.style.transform = "translateX(0)";
        return;
    }

    secondCopy.style.display = "inline-block";

    // Uses the same gap setting as the song title.
    const gap = Math.max(
        10,
        Math.min(containerWidth * GAP_FRACTION, oneCopyWidth * 0.5)
    );

    secondCopy.style.marginLeft = `${gap}px`;

    const totalDistance = oneCopyWidth + gap;
    const totalDuration = totalDistance / TITLE_SCROLL_SPEED;

    const token = ++authorAnimationToken;
    authorAnimationRunning = true;

    let startTime = null;
    let phase = "initialPause";
    let pauseStartTime = null;

    function animate(timestamp) {
        if (!authorAnimationRunning || token !== authorAnimationToken) return;

        if (!startTime) startTime = timestamp;

        const elapsed = (timestamp - startTime) / 1000;

        if (phase === "initialPause") {
            authorInner.style.transform = "translateX(0)";

            if (elapsed >= SLIDE_DURATION) {
                phase = "slide";
                startTime = timestamp;
            }
        } else if (phase === "slide") {
            const progress = Math.min(elapsed / totalDuration, 1);

            authorInner.style.transform =
                `translateX(${-progress * totalDistance}px)`;

            if (progress >= 1) {
                phase = "pause";
                pauseStartTime = timestamp;
            }
        } else if (phase === "pause") {
            const pauseElapsed = (timestamp - pauseStartTime) / 1000;

            if (pauseElapsed >= PAUSE_DURATION) {
                authorInner.style.transform = "translateX(0)";
                startTime = timestamp;
                phase = "slide";
            }
        }

        requestAnimationFrame(animate);
    }

    requestAnimationFrame(animate);
}

window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        stopTitleAnimation();
        stopAuthorAnimation();

        requestAnimationFrame(() => {
            startTitleAnimation();
            startAuthorAnimation();
        });
    }, 300);
});

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', function() {
    initCacheManager();
});