let player;
let playing = false;
let songUnavailable = false;
let progressInterval;
let isDragging = false;
let errorTimeout;
let selectedVideoId;
let countdownInterval;
let darkModeToggleInProgress = false;
let albumArtSpinEnabled = JSON.parse(localStorage.getItem("albumArtSpin")) ?? true;
let actualSelectedVideoId = null;

// YOUTUBE_API_KEY is now loaded from config.js 

// Search Cache to minimize API calls for repeated searches
const searchCache = JSON.parse(localStorage.getItem('ytSearchCache') || '{}');
const CACHE_EXPIRY = 3600000; // 1 hour in milliseconds
let searchTimeout;

// CORS Proxy URL - Used to bypass CORS restrictions for YouTube API calls
// You can change this if you find a more reliable proxy.
// Example: https://corsproxy.io/?
const CORS_PROXY_URL = 'https://corsproxy.io/?';

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

// Load playlist from local storage or use a default if none exists
function loadPlaylist() {
    const storedPlaylist = localStorage.getItem('youtubeMusicPlaylist');
    if (storedPlaylist) {
        playlist = JSON.parse(storedPlaylist);
    } else {
        // Default playlist if local storage is empty
        playlist = [
            { videoId: 'wX_y95OrHLQ', songName: '打打だいず (D-D-Dice) Official - Starlight Traveler', authorName: '打打だいず (D-D-Dice) Official', albumArt: 'https://i.ytimg.com/vi/wX_y95OrHLQ/hqdefault.jpg' },
            { videoId: 'TQ8WlA2GXbk', songName: 'Official髭男dism - Pretender［Official Video］', authorName: 'Official髭男dism', albumArt: 'https://i.ytimg.com/vi/TQ8WlA2GXbk/hqdefault.jpg' },
            { videoId: 'DuMqFknYHBs', songName: 'Official髭男dism - イエスタデイ［Official Video］', authorName: 'Official髭男dism', albumArt: 'https://i.ytimg.com/vi/DuMqFknYHBs/hqdefault.jpg' },
            { videoId: 'keOnleW2eak', songName: 'Official髭男dism - らしさ [Official Video]', authorName: 'Official髭男dism', albumArt: 'https://i.ytimg.com/vi/keOnleW2eak/hqdefault.jpg' },
            { videoId: 'jTTuA0msOyg', songName: 'Present', authorName: 'SEKAI NO OWARI - Topic', albumArt: 'https://i.ytimg.com/vi/jTTuA0msOyg/hqdefault.jpg' },
            { videoId: 'gZFGA41Slh0', songName: 'Illumination', authorName: 'SEKAI NO OWARI - Topic', albumArt: 'https://i.ytimg.com/vi/gZFGA41Slh0/hqdefault.jpg' },
            { videoId: 'QlyW9kYHTDo', songName: 'Time Machine', authorName: 'SEKAI NO OWARI - Topic', albumArt: 'https://i.ytimg.com/vi/QlyW9kYHTDo/hqdefault.jpg' },
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
    const currentPlayingVideoId = player ? player.getVideoData().video_id : null;
    const wasPlayingCurrent = currentPlayingVideoId === videoIdToRemove && playing;

    playlist = playlist.filter(song => song.videoId !== videoIdToRemove);
    savePlaylist();
    renderPlaylist(playlist);

    // ✅ If the removed song was the actual selected one, clear the selection
    if (actualSelectedVideoId === videoIdToRemove) {
        actualSelectedVideoId = null;
    }

    // If the removed song was the currently playing one
    if (wasPlayingCurrent) {
        if (playlist.length > 0) {
            // Play the next song in the updated playlist
            playNextSong();
        } else {
            // If playlist is empty, stop playback and reset UI
            player.stopVideo();
            playing = false;
            document.getElementById('playPauseBtn').innerHTML = ICON_PLAY;
            document.getElementById('albumArt').src = 'https://via.placeholder.com/300';
            document.getElementById('nowPlaying .song-title').innerText = 'No Song';
            document.getElementById('nowPlaying .author-name').innerText = '';
            document.getElementById('progress').style.width = '0%';
            document.getElementById('currentTime').innerText = '0:00';
            document.getElementById('totalTime').innerText = '0:00';
            document.getElementById('background').style.backgroundImage = 'none';
            clearInterval(progressInterval);
            
            // ✅ Clear the actual selected video ID when playlist is empty
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
    console.log("Attempting YouTube search...");
    // YOUTUBE_API_KEY is now a global variable from config.js
    console.log("API Key present (from config.js): ", typeof YOUTUBE_API_KEY !== 'undefined' && YOUTUBE_API_KEY.length > 10);

    const searchTerm = document.getElementById('youtubeSearchInput').value.trim();
    const searchResultsList = document.getElementById('searchResultsList');
    const searchLoading = document.getElementById('searchLoading');
    const searchError = document.getElementById('searchError');
    const searchResultsContainer = document.getElementById('searchResults');

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

    if (typeof YOUTUBE_API_KEY === 'undefined' || YOUTUBE_API_KEY === 'YOUR_YOUTUBE_API_KEY') {
        const t = translations[currentLang];
        const searchError = document.getElementById('searchError');
        const searchLoading = document.getElementById('searchLoading');

        // Use innerHTML to properly structure the error message
        searchError.innerHTML = `<i class='bx bx-error'></i> ${t.youtubeApiKeyError}`;
        searchError.classList.remove('d-none');
        searchLoading.classList.add('d-none');
        return;
    }

    searchLoading.classList.remove('d-none'); // Show loading indicator

    try {
        // Construct the URL for the YouTube API call
        const youtubeApiUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(searchTerm)}&type=video&maxResults=10&key=${YOUTUBE_API_KEY}`;
        
        // Prepend the CORS proxy URL to the YouTube API URL
        // The URL for the proxy itself needs to be encoded if it contains query parameters
        const proxiedUrl = `${CORS_PROXY_URL}${encodeURIComponent(youtubeApiUrl)}`;

        console.log("Fetching from proxied URL:", proxiedUrl);

        const response = await fetch(proxiedUrl);
        
        if (!response.ok) {
            const errorText = await response.text(); // Get raw text for more info
            console.error('YouTube API Error (via proxy):', response.status, response.statusText, errorText);
            searchError.textContent = `YouTube API Error: ${response.status} ${response.statusText}. Check console for details.`;
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
                        <button class="btn btn-success btn-sm add-from-search-btn" title="${translations[currentLang].addToPlaylist}"
                                data-video-id="${videoId}" 
                                data-song-title="${title.replace(/"/g, '&quot;')}" 
                                data-author-name="${channelTitle.replace(/"/g, '&quot;')}" 
                                data-album-art="${thumbnailUrl}">
                            ${translations[currentLang].add}
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
            searchResultsList.innerHTML = '<p class="text-center text-muted">No results found.</p>';
        }

    } catch (error) {
        console.error('Error searching YouTube (via proxy):', error);
        searchLoading.classList.add('d-none');
        searchError.innerHTML = `<i class='bx bx-error'></i> ${t.youtubeSearchError}`;
        searchError.classList.remove('d-none');
    }
}

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
        searchResultsList.innerHTML = '<p class="text-center text-muted">No results found.</p>';
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

let currentVolume = parseInt(localStorage.getItem("volumeLevel")) || 100;

// Make onYouTubeIframeAPIReady globally accessible
window.onYouTubeIframeAPIReady = function() {
    console.log("YouTube IFrame API is ready!");
    if (playlist.length > 0) {
        selectedVideoId = playlist[0].videoId;
    } else {
        selectedVideoId = ''; // No default video if playlist is empty
    }

    player = new YT.Player('player', {
        videoId: selectedVideoId,
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
                //event.target.playVideo();
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
                if (document.getElementById("autoPlayToggle").checked) {
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
    let albumArt = document.getElementById("albumArt");
    albumArt.style.transition = "opacity 0.5s ease-in-out";
    albumArt.style.opacity = "0";

    setTimeout(() => {
        albumArt.classList.remove("rotate");
        albumArt.style.transform = "rotate(0deg)";

        if (albumArtUrl && isValidImageUrl(albumArtUrl)) {
            albumArt.setAttribute("src", albumArtUrl);
        } else {
            console.error("Invalid or unsafe albumArtUrl:", albumArtUrl);
            albumArt.setAttribute("src", "https://via.placeholder.com/300"); // Fallback
        }

        albumArt.onload = () => {
            setTimeout(() => {
                albumArt.style.opacity = "1";
                if (playing && albumArtSpinEnabled) {
                    albumArt.classList.remove("rotate-paused");
                    albumArt.classList.add("rotate");
                } else {
                    albumArt.classList.remove("rotate", "rotate-paused");
                }
            }, 500);
        };
    }, 500);

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
    }

    // Update selectedVideoId
    selectedVideoId = videoId;

    // ✅ Reset progress bar and timer
    document.getElementById("progress").style.width = "0%";
    document.getElementById("currentTime").innerText = "0:00";
    document.getElementById("totalTime").innerText = "0:00";

    playing = true;
    document.getElementById("playPauseBtn").innerHTML = ICON_PAUSE; // Use constant

    // ✅ Start tracking progress
    updateProgressBar();
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
});

document.addEventListener("DOMContentLoaded", function () {
    const volumeControl = document.getElementById("volumeControl");
    const volumeProgress = document.getElementById("volumeProgress");
    const volumeThumb = document.getElementById("volumeThumb");
    const volumeBarContainer = document.querySelector(".volume-bar-container");

    volumeControl.value = currentVolume;
    updateVolumeUI(currentVolume);

    function updateVolumeUI(volumeValue) {
        const progressBarWidth = volumeBarContainer.offsetWidth;
        const thumbWidth = volumeThumb.offsetWidth; 
        const thumbPosition = (volumeValue / 100) * (progressBarWidth - thumbWidth) + (thumbWidth / 2);

        volumeProgress.style.width = `${volumeValue}%`;
        volumeThumb.style.left = `${thumbPosition}px`;
    }

    volumeControl.addEventListener("input", function () {
        let volumeValue = this.value;
        currentVolume = volumeValue;
        localStorage.setItem("volumeLevel", volumeValue);

        if (player) {
            player.setVolume(volumeValue);
        }
        updateVolumeUI(volumeValue);
    });

    // Adjust position on window resize
    window.addEventListener("resize", () => {
        updateVolumeUI(volumeControl.value);
    });

    // Initialize on page load
    updateVolumeUI(volumeControl.value);
});

document.addEventListener("DOMContentLoaded", function () {
    const albumArtSpinToggle = document.getElementById("albumArtSpinToggle");
    if (albumArtSpinToggle) {
        albumArtSpinToggle.checked = albumArtSpinEnabled;
        applyAlbumArtSpinSetting();
        
        albumArtSpinToggle.addEventListener("change", function () {
            albumArtSpinEnabled = this.checked;
            localStorage.setItem("albumArtSpin", JSON.stringify(albumArtSpinEnabled));
            applyAlbumArtSpinSetting();
        });
    }
});

function applyAlbumArtSpinSetting() {
    const albumArt = document.getElementById("albumArt");
    if (!albumArt) return;

    if (!albumArtSpinEnabled) {
        albumArt.classList.remove("rotate", "rotate-paused");
    } else if (playing) {
        albumArt.classList.remove("rotate-paused");
        albumArt.classList.add("rotate");
    }
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

document.getElementById("playPauseBtn").addEventListener("click", function () {
    if (songUnavailable) return; // Prevent play if song is unavailable

    let albumArt = document.getElementById("albumArt");

    if (player) {
        if (playing) {
            player.pauseVideo();
            this.innerHTML = ICON_PLAY; // Use constant
            clearInterval(progressInterval);
            if (albumArtSpinEnabled) {
                albumArt.classList.add("rotate-paused");
            }
        } else {
            player.playVideo();
            this.innerHTML = ICON_PAUSE; // Use constant
            updateProgressBar();
            if (albumArtSpinEnabled) {
                albumArt.classList.remove("rotate-paused");
                albumArt.classList.add("rotate");
            } else {
                // If disabled → remove all spin classes
                albumArt.classList.remove("rotate", "rotate-paused");
            }
            // ✅ If bx-revision is showing, reset it to Play/Pause
            if (this.innerHTML.includes("bx-revision")) {
                this.innerHTML = ICON_PAUSE;
            }
        }
        playing = !playing;
    }
});

document.getElementById("prevBtn").addEventListener("click", playPreviousSong);
document.getElementById("nextBtn").addEventListener("click", playNextSong);

function playPreviousSong() {
    let songItems = document.querySelectorAll("#songList li");
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

    // ✅ Update the actual selected video ID
    actualSelectedVideoId = prevVideoId;

    loadNewVideo(prevVideoId, prevAlbumArtUrl, prevSongObject);
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
                    playNextSong(); // Play next song if Auto-Play is ON
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
    let autoPlay = document.getElementById("autoPlayToggle").checked;

    if (event.data === 0) { // ✅ 0 means video ended
        playing = false;
        albumArt.classList.add("rotate-paused");

        if (repeatSong) {
            player.seekTo(0); // ✅ Restart the current song
            player.playVideo(); // ✅ Always play again when Repeat is ON
        } else if (autoPlay) {
            playNextSong(); // ✅ Play next song if Auto-Play is ON
        } else {
            // ✅ Show bx-revision when the song ends and Auto-Play is OFF
            playPauseBtn.innerHTML = ICON_REVISION; // Use constant
        }
    } else if (event.data === 2) { // ✅ 2 means PAUSED
        playPauseBtn.innerHTML = ICON_PLAY; // Use constant
        playing = false;
        albumArt.classList.add("rotate-paused");
    } else if (event.data === 1) { // ✅ 1 means PLAYING
        playPauseBtn.innerHTML = ICON_PAUSE; // Use constant
        playing = true;
        if (albumArtSpinEnabled) {
            albumArt.classList.add("rotate");
        } else {
            albumArt.classList.remove("rotate-paused");
        }
    }
}

document.getElementById("togglePlayerBtn").addEventListener("click", function () {
    let playerContainer = document.getElementById("playerContainer");
    const t = translations[currentLang];

    if (playerContainer.classList.contains("d-none")) {
        playerContainer.classList.remove("d-none"); // Show player
        this.innerText = t.hidePlayer;
    } else {
        playerContainer.classList.add("d-none"); // Hide player
        this.innerText = t.showPlayer;
    }
});

document.addEventListener("DOMContentLoaded", function () {
    // Check if dark mode is enabled in local storage before page renders
    if (localStorage.getItem("darkMode") === "enabled") {
        document.body.classList.add("dark-mode");
        document.getElementById("darkModeToggle").innerHTML = "Disable";
        applyDarkModeToElements(true);
    }

    // Ensure body opacity animation starts only after dark mode is set
    document.body.style.opacity = "1";
});

document.getElementById("darkModeToggle").addEventListener("click", function () {
    if (darkModeToggleInProgress) return; // Prevent spam clicking
    darkModeToggleInProgress = true;

    requestAnimationFrame(() => {
        const isDarkMode = document.body.classList.toggle("dark-mode");

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

        // Change button text
        const t = translations[currentLang];
        this.innerHTML = isDarkMode ? t.darkModeDisable : t.darkModeEnable;

        // Prevent rapid toggling
        setTimeout(() => {
            darkModeToggleInProgress = false;
        }, 600);
    });
});

function applyDarkModeToElements(enable) {
    document.querySelectorAll(
        ".card, .btn-dark-mode-toggle, .author-name, .song-title, box-icon, #songList, #songList .list-group-item, #songList .list-group-item-action, #songList .song, #songList .author, #searchResultsList .list-group-item, #searchResultsList h6, #searchResultsList p"
    ).forEach(el => el.classList.toggle("dark-mode", enable));

    // Explicitly change text color for smooth transition
    document.querySelectorAll("#nowPlaying .song-title, #nowPlaying .author-name, #songList .author, #searchResultsList h6, #searchResultsList p")
        .forEach(elem => {
            elem.style.transition = "color 0.8s ease-in-out";
            elem.style.color = enable ? "white" : "black";
        });
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
    const settingsClearCacheBtn = document.getElementById("settingsClearCacheBtn");
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

    // Clear cache functionality
    settingsClearCacheBtn.addEventListener("click", function() {
        if (confirm(translations[currentLang].clearCacheConfirm)) {
            localStorage.removeItem('ytSearchCache');
            for (const key in searchCache) {
                delete searchCache[key];
            }
            alert(translations[currentLang].cacheCleared);
            console.log(translations[currentLang].cacheCleared);
            closeSettingsMenu();
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

// Initialize from saved state
document.addEventListener("DOMContentLoaded", () => {
  const savedState = localStorage.getItem("showLyrics");
  if (savedState === null) {
    // Default: OFF (lyrics hidden)
    lyricsPanel.style.display = "none";
    lyricsToggle.checked = false;
    localStorage.setItem("showLyrics", false);
  } else if (savedState === "true") {
    lyricsPanel.style.display = "block";
    lyricsToggle.checked = true;
  } else {
    lyricsPanel.style.display = "none";
    lyricsToggle.checked = false;
  }
});

// When user toggles switch
lyricsToggle.addEventListener("change", () => {
  const isVisible = lyricsToggle.checked;
  lyricsPanel.style.display = isVisible ? "block" : "none";
  localStorage.setItem("showLyrics", isVisible);
});

lyricsToggle.addEventListener("change", () => {
  const isVisible = lyricsToggle.checked;
  lyricsPanel.classList.toggle("hidden", !isVisible);
  localStorage.setItem("showLyrics", isVisible);
});

// Export playlist function
function exportPlaylist() {
    try {
        // Get current playlist and dark mode status
        const exportData = {
            playlist: playlist,
            albumArtSpin: albumArtSpinEnabled,
            darkMode: localStorage.getItem("darkMode") === "enabled",
            showLyrics: localStorage.getItem("showLyrics") === "true",
            language: currentLang,
            exportDate: new Date().toISOString(),
            version: "1.3"
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
            
            if (Array.isArray(importedData)) {
                // Old format - just the playlist array
                importedPlaylist = importedData;
            } else if (importedData.playlist && Array.isArray(importedData.playlist)) {
                // New format - object with playlist and darkMode properties
                importedPlaylist = importedData.playlist;
                importDarkMode = importedData.darkMode === true;
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
                if (importDarkMode) {
                    document.body.classList.add("dark-mode");
                    localStorage.setItem("darkMode", "enabled");
                    document.getElementById("darkModeToggle").innerHTML = "Disable";
                    applyDarkModeToElements(true);
                } else {
                    document.body.classList.remove("dark-mode");
                    localStorage.setItem("darkMode", "disabled");
                    document.getElementById("darkModeToggle").innerHTML = "Enable";
                    applyDarkModeToElements(false);
                }

                if (importedData.showLyrics !== undefined) {
                    const lyricsPanel = document.getElementById("lyricsPanel");
                    const lyricsToggle = document.getElementById("lyricsToggle");
                    const showLyrics = importedData.showLyrics;

                    localStorage.setItem("showLyrics", showLyrics);
                    
                    // Update toggle switch
                    if (lyricsToggle) {
                        lyricsToggle.checked = showLyrics;
                    }
                    
                    // Update panel visibility
                    if (lyricsPanel) {
                        if (showLyrics) {
                            lyricsPanel.style.display = "block";
                            lyricsPanel.classList.remove("hidden");
                        } else {
                            lyricsPanel.style.display = "none";
                            lyricsPanel.classList.add("hidden");
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
                
                // Play the first song if playlist was empty before
                if (playlist.length > 0 && (!player || !playing)) {
                    const firstSong = playlist[0];
                    //loadNewVideo(firstSong.videoId, firstSong.albumArt, firstSong);
                }

                if (importedData.albumArtSpin !== undefined) {
                    albumArtSpinEnabled = importedData.albumArtSpin;
                    localStorage.setItem("albumArtSpin", JSON.stringify(albumArtSpinEnabled));
                    const toggle = document.getElementById("albumArtSpinToggle");
                    if (toggle) toggle.checked = albumArtSpinEnabled;
                    applyAlbumArtSpinSetting();
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

                    // ✅ Load video but don’t autoplay
                    selectedVideoId = firstSong.videoId;
                    if (player && player.loadVideoById) {
                        player.cueVideoById(firstSong.videoId); // cue = load but don’t play
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
                if (importedData.albumArtSpin !== undefined) {
                    const spinStatus = importedData.albumArtSpin ? translations[currentLang].enabled : translations[currentLang].disabled;
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
      return `
        <div class="lrc-line" data-index="${i}" data-time="${l.time}">
          <span class="lrc-time">[${m}:${s < 10 ? "0" + s : s}]</span>
          ${l.text}
        </div>`;
    })
    .join("");
}

function syncLyricsToTime(currentTime) {
  if (!lyricsData || !lyricsData.isLrc) return;
  const lines = lyricsData.lrcLines;
  if (!lines || lines.length === 0) return;

  // --- binary search for nearest line ---
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

  // remove previous highlight
  for (let i = 0; i < children.length; i++) {
    children[i].classList.remove("highlight");
  }

  // highlight new line
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

let lyricsState = {
  status: "idle", // idle | loading | synced | plain | error | notfound
  artist: "",
  title: ""
};

async function fetchLyrics(title, artist) {
  const tryFetch = async (a, t) => {
    const url = `https://lrclib.net/api/get?artist_name=${encodeURIComponent(a)}&track_name=${encodeURIComponent(t)}`;
    console.log("Trying:", url);

    const proxy = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
    const res = await fetch(proxy);
    const data = await res.json();
    return JSON.parse(data.contents || "{}");
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
    if (!lyrics) throw new Error("No lyrics");

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
    lyricsData = null;
    textEl.textContent = t.lyricsNotFound;
    meta.textContent = t.lyricsError;
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

  // Remove any extra brackets/annotations
  title = title.replace(
    /\[[^\]]*\]|\([^)]*\)|［[^］]*］|【[^】]*】|「[^」]*」|『[^』]*』/g,
    ""
  );

  // Remove noise keywords
  title = title.replace(
    /official\s*video|music\s*video|mv|lyrics?|lyric\s*video|ver\.?|HD|4K|provided\s*to\s*youtube\s*by|auto[-\s]*generated\s*by\s*youtube|topic/gi,
    ""
  );

  title = title.replace(/[\uFF5E\u2013\u2014\-–—]+/g, "-");
  title = title.replace(/\s{2,}/g, " ").trim();

  let extractedArtist = artist.trim();
  let extractedTrack = title.trim();

  // Japanese Artist「Track」 detection
  const jpMatch = rawTitle.match(/^(.+?)「(.+?)」/);
  if (jpMatch) {
    extractedArtist = jpMatch[1].trim();
    extractedTrack = jpMatch[2].trim();
  }

  // Artist - Track format
  const dashMatch = extractedTrack.match(/^(.+?)\s*-\s*(.+)$/);
  if (dashMatch) {
    extractedArtist = dashMatch[1].trim();
    extractedTrack = dashMatch[2].trim();
  }

  // ✅ Remove leftover brackets
  extractedArtist = extractedArtist.replace(/[【】\[\]()「」『』]/g, "").trim();
  extractedTrack = extractedTrack.replace(/[【】\[\]()「」『』]/g, "").trim();

  // ✅ YouTube Auto Generated “- Topic” fix
  extractedArtist = extractedArtist.replace(/\s*-\s*topic$/i, "").trim();

  // ✅ Remove trailing/leading hyphens in artist
  extractedArtist = extractedArtist.replace(/^[-–—]+|[-–—]+$/g, "").trim();

  // ✅ Avoid cases like "SEKAI NO OWARI - SEKAI NO OWARI"
  if (extractedTrack.toLowerCase().startsWith(extractedArtist.toLowerCase())) {
    extractedTrack = extractedTrack.slice(extractedArtist.length).trim();
  }

  // If still empty or same → fallback to title-only parsed track
  if (
    !extractedTrack ||
    extractedTrack.toLowerCase() === extractedArtist.toLowerCase()
  ) {
    // Try to extract non-letter characters (JP titles etc.)
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
  btn.textContent = autoSyncEnabled ? translations[currentLang].autoSyncOn : translations[currentLang].autoSyncOff;
});
document.getElementById("refreshLyricsBtn").addEventListener("click", () => {
  const title = (document.querySelector("#nowPlaying .song-title")?.innerText || "").trim();
  const artist = (document.querySelector("#nowPlaying .author-name")?.innerText || "").trim();
  if (title) loadLyricsFor(title, artist);
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
    playlistTitle: "My Playlist",
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
    visitForkProfile: "Visit Fork Maintainer's Profile",
    visitForkRepo: "Visit Forked Repository",
    visitCreatorProfile: "Visit Original Creator's Profile",
    visitCreatorRepo: "Visit Original Repository",
    exportTitle: "Export Playlist & Data",
    importTitle: "Import Playlist & Data",
    clearCacheTitle: "Clear Search Cache",
    exportPlaylist: "Export Playlist & Data",
    importPlaylist: "Import Playlist & Data",
    clearCache: "Clear Search Cache",
    albumArtSpin: "Album Art Spin",
    showLyrics: "Show Lyrics Panel",
    darkMode: "Dark Mode",
    darkModeEnable: "Enable",
    darkModeDisable: "Disable",
    toggleLyricsTooltip: "Toggle to show or hide lyrics",
    videoPlayer: "Video Player",
    showPlayer: "Show Player",
    hidePlayer: "Hide Player",
    goTop: "Go to Top",
    creatorTitle: "Original Creator",
    creatorDesc: "Original creator of this YouTube Music Player project.",
    creatorBtn: "Original Creator",
    visitRepo: "Visit Repository",
    maintainerTitle: "Fork Maintainer",
    maintainerDesc: "Maintainer of <a href='https://github.com/Farwalker3/YouTube-Music-Player-Web' target='_blank'>this forked version</a> with enhanced features.",
    maintainerBtn: "Fork Maintainer",
    experimentalTitle: "Experimental Project",
    experimentalWarning: "⚠ Warning: This project may be unstable and unsafe. Use at your own risk.",
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
    playlistTitle: "我的播放列表",
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
    visitForkProfile: "访问分支维护者的个人资料",
    visitForkRepo: "访问分支仓库",
    visitCreatorProfile: "访问原始创作者的个人资料",
    visitCreatorRepo: "访问原始仓库",
    exportTitle: "导出播放列表和数据",
    importTitle: "导入播放列表和数据",
    clearCacheTitle: "清除搜索缓存",
    exportPlaylist: "导出播放列表和数据",
    importPlaylist: "导入播放列表和数据",
    clearCache: "清除搜索缓存",
    albumArtSpin: "唱片旋转",
    showLyrics: "显示歌词面板",
    darkMode: "深色模式",
    darkModeEnable: "启用",
    darkModeDisable: "关闭",
    toggleLyricsTooltip: "切换以显示或隐藏歌词",
    videoPlayer: "视频播放器",
    showPlayer: "显示播放器",
    hidePlayer: "隐藏播放器",
    goTop: "返回顶部",
    creatorTitle: "原始创作者",
    creatorDesc: "此 YouTube 音乐播放器项目的原始创作者。",
    creatorBtn: "原始创作者",
    visitRepo: "访问仓库",
    maintainerTitle: "分支维护者",
    maintainerDesc: "此 <a href='https://github.com/Farwalker3/YouTube-Music-Player-Web' target='_blank'>分支</a> 的维护者，具有增强功能。",
    maintainerBtn: "分支维护者",
    experimentalTitle: "实验性项目",
    experimentalWarning: "⚠ 警告：此项目可能不稳定且存在风险，请自行承担使用风险。",
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

    document.querySelector("#toggleSyncBtn") && (document.querySelector("#toggleSyncBtn").textContent = t.autoSyncOn);
    document.querySelector("#refreshLyricsBtn") && (document.querySelector("#refreshLyricsBtn").textContent = t.refresh);
    document.querySelector("#openRawBtn") && (document.querySelector("#openRawBtn").textContent = t.raw);

    // Add this line to the applyLanguage function
    document.getElementById("autoPlayText") && (document.getElementById("autoPlayText").textContent = t.autoPlay);
    document.querySelector("#repeatBtn")?.nextElementSibling && 
    (document.querySelector("#repeatBtn").nextElementSibling.textContent = t.repeat);

    document.querySelector(".bxs-playlist")?.parentElement && 
    (document.querySelector(".bxs-playlist").parentElement.lastChild.textContent = ` ${t.playlistTitle}`);
    document.querySelector("#searchPlaylistInput")?.setAttribute("placeholder", t.searchPlaylist);
    document.querySelector(".fw-bold.border-bottom span:first-child")?.textContent && 
    (document.querySelector(".fw-bold.border-bottom span:first-child").textContent = t.songName);
    document.querySelector(".fw-bold.border-bottom span:last-child")?.textContent && 
    (document.querySelector(".fw-bold.border-bottom span:last-child").textContent = t.authorName);

    document.querySelector(".bxs-videos")?.parentElement && 
    (document.querySelector(".bxs-videos").parentElement.lastChild.textContent = ` ${t.videoPlayer}`);
    const playerToggleBtn = document.getElementById("togglePlayerBtn");
    if (playerToggleBtn) {
    const isHidden = document.getElementById("playerContainer")?.classList.contains("d-none");
    playerToggleBtn.textContent = isHidden ? t.showPlayer : t.hidePlayer;
    }

    document.querySelector("#goTopBtn")?.setAttribute("title", t.goTop);

    // Floating settings button
    document.getElementById("settingsBtn")?.setAttribute("title", t.settingsTitle);

    // YouTube search button
    document.getElementById("youtubeSearchBtn")?.setAttribute("title", t.searchYouTubeTitle);

    // Remove song buttons (loop all)
    document.querySelectorAll(".remove-song-btn").forEach(btn => {
    btn.setAttribute("title", t.removeSongTitle);
    });

    // Fork / Creator profile links
    document.querySelector("#maintainerBtn")?.setAttribute("title", t.visitForkProfile);
    document.querySelector("#maintainerRepoBtn")?.setAttribute("title", t.visitForkRepo);
    document.querySelector("#creatorBtn")?.setAttribute("title", t.visitCreatorProfile);
    document.querySelector("#creatorRepoBtn")?.setAttribute("title", t.visitCreatorRepo);

    // Settings submenu buttons
    document.querySelector("#settingsExportBtn")?.setAttribute("title", t.exportTitle);
    document.querySelector("#settingsImportBtn")?.setAttribute("title", t.importTitle);
    document.querySelector("#settingsClearCacheBtn")?.setAttribute("title", t.clearCacheTitle);


    // 🧩 Settings Menu
    document.querySelector(".settings-header h6")?.childNodes[1] && 
    (document.querySelector(".settings-header h6").childNodes[1].nodeValue = ` ${t.settingsTitle}`);
    document.querySelector("#settingsExportBtn") && (document.querySelector("#settingsExportBtn").innerHTML = `<i class='bx bx-export'></i> ${t.exportPlaylist}`);
    document.querySelector("#settingsImportBtn") && (document.querySelector("#settingsImportBtn").innerHTML = `<i class='bx bx-import'></i> ${t.importPlaylist}`);
    document.querySelector("#settingsClearCacheBtn") && (document.querySelector("#settingsClearCacheBtn").innerHTML = `<i class='bx bx-trash'></i> ${t.clearCache}`);
    document.querySelector("label[for='albumArtSpinToggle']") && (document.querySelector("label[for='albumArtSpinToggle']").textContent = t.albumArtSpin);
    document.querySelector("label[for='lyricsToggle']") && (document.querySelector("label[for='lyricsToggle']").textContent = t.showLyrics);
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
        
        // Check if it's an API key error (contains "API Key" or similar)
        if (currentErrorText.includes("API") || currentErrorText.includes("config.js") || currentErrorText.includes("YOUR_YOUTUBE_API_KEY")) {
            searchError.innerHTML = `<i class='bx bx-error'></i> ${t.youtubeApiKeyError}`;
        } else if (currentErrorText.includes("Unable to search") || currentErrorText.includes("internet connection")) {
            // It's a general search error
            searchError.innerHTML = `<i class='bx bx-error'></i> ${t.youtubeSearchError}`;
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


    // 🎨 Creator & Maintainer Cards
    document.getElementById("creatorDesc").textContent = t.creatorDesc;
    document.getElementById("creatorBtn").innerHTML = `<i class='bx bx-link-external'></i> ${t.creatorBtn}`;
    document.getElementById("creatorRepoBtn").innerHTML = `<i class='bx bx-link-external'></i> ${t.visitRepo}`;

    document.getElementById("maintainerDesc").innerHTML =
    `${t.maintainerDesc.replace("this forked version", "<a href='https://github.com/Farwalker3/YouTube-Music-Player-Web' target='_blank'>this forked version</a>")}`;
    document.getElementById("maintainerBtn").innerHTML = `<i class='bx bx-link-external'></i> ${t.maintainerBtn}`;
    document.getElementById("maintainerRepoBtn").innerHTML = `<i class='bx bx-link-external'></i> ${t.visitRepo}`;

    // 🧪 Experimental Project Section
    document.getElementById("experimentalTitle") && 
    (document.getElementById("experimentalTitle").innerHTML = `<i class='bx bxs-flask'></i> ${t.experimentalTitle}`);

    document.getElementById("experimentalWarning") && 
    (document.getElementById("experimentalWarning").textContent = t.experimentalWarning);

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
