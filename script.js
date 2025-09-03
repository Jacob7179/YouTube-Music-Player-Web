let player;
let playing = false;
let songUnavailable = false;
let progressInterval;
let isDragging = false;
let errorTimeout;
let selectedVideoId;
let countdownInterval;
let darkModeToggleInProgress = false;

// IMPORTANT: Replace with your actual YouTube Data API Key
const YOUTUBE_API_KEY = 'YOUR_YOUTUBE_API_KEY'; 

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
            { videoId: 'LgNT-a_ekC8', songName: '无名的人', authorName: '毛不易', albumArt: 'https://i.ytimg.com/vi/LgNT-a_ekC8/hqdefault.jpg' },
            { videoId: 'yBaYm7Ig7ZQ', songName: '点燃银河尽头的篝火', authorName: '华晨宇', albumArt: 'https://i.ytimg.com/vi/yBaYm7Ig7ZQ/hqdefault.jpg' },
            { videoId: 'eSvnAyHFoyo', songName: '好想爱这个世界啊', authorName: '华晨宇', albumArt: 'https://i.ytimg.com/vi/eSvnAyHFoyo/hqdefault.jpg' },
            { videoId: 'wmRkAWPuvCg', songName: '我管你', authorName: '华晨宇', albumArt: 'https://i.ytimg.com/vi/wmRkAWPuvCg/hqdefault.jpg' },
            { videoId: 'Oewc0KgfQUU', songName: '贝加尔湖畔', authorName: '李健', albumArt: 'https://i.ytimg.com/vi/Oewc0KgfQUU/hqdefault.jpg' },
            { videoId: 'Nk9ztUjikT0', songName: '风吹麦浪', authorName: '李健', albumArt: 'https://i.ytimg.com/vi/Nk9ztUjikT0/hqdefault.jpg' },
            { videoId: 'N-RZKm29Qz8', songName: '浪人琵琶', authorName: '胡66', albumArt: 'https://i.ytimg.com/vi/N-RZKm29Qz8/hqdefault.jpg' },
            { videoId: 'YPdRwoIZgVs', songName: '日落大道', authorName: '梁博', albumArt: 'https://i.ytimg.com/vi/YPdRwoIZgVs/hqdefault.jpg' },
            { videoId: 'mrY8qdNHcRs', songName: '回不去的夏天', authorName: '夏日入侵企画', albumArt: 'https://i.ytimg.com/vi/mrY8qdNHcRs/hqdefault.jpg' },
            { videoId: 'jS0rDCTyg-E', songName: '尘星', authorName: '夏日入侵企画', albumArt: 'https://i.ytimg.com/vi/jS0rDCTyg-E/hqdefault.jpg' },
            { videoId: 'rQOIRBrY7h0', songName: '我們都擁有海洋 (嗶哩嗶哩2023畢業歌)', authorName: '吳青峰', albumArt: 'https://i.ytimg.com/vi/rQOIRBrY7h0/hqdefault.jpg' },
            { videoId: 'wX_y95OrHLQ', songName: 'Starlight Traveler', authorName: 'D-D-Dice · aaaa', albumArt: 'https://i.ytimg.com/vi/wX_y95OrHLQ/hqdefault.jpg' },
            { videoId: 'TQ8WlA2GXbk', songName: 'Pretender', authorName: 'OFFICIAL HIGE DANDISM', albumArt: 'https://i.ytimg.com/vi/TQ8WlA2GXbk/hqdefault.jpg' },
            { videoId: 'DuMqFknYHBs', songName: 'イエスタデイ - Yesterday', authorName: 'OFFICIAL HIGE DANDISM', albumArt: 'https://i.ytimg.com/vi/DuMqFknYHBs/hqdefault.jpg' },
            { videoId: 'EZy_vHyFedw', songName: 'ミックスナッツ - Mixed Nuts', authorName: 'OFFICIAL HIGE DANDISM', albumArt: 'https://i.ytimg.com/vi/EZy_vHyFedw/hqdefault.jpg' },
            { videoId: 'qvk4Rl7r2GY', songName: '百花繚乱', authorName: '幾田りら (Lilas Ikuta)', albumArt: 'https://i.ytimg.com/vi/qvk4Rl7r2GY/hqdefault.jpg' },
            { videoId: 'q4CbHfW3Ji8', songName: 'スパークル - Sparkle', authorName: '幾田りら (Lilas Ikuta)', albumArt: 'https://i.ytimg.com/vi/q4CbHfW3Ji8/hqdefault.jpg' },
            { videoId: 'kerzepq4imY', songName: 'もしも明日が', authorName: 'Warabe (わらべ)', albumArt: 'https://i.ytimg.com/vi/kerzepq4imY/hqdefault.jpg' },
            { videoId: 'U4pM3yB9KtU', songName: 'MUGEN', authorName: 'MY FIRST STORY', albumArt: 'https://i.ytimg.com/vi/U4pM3yB9KtU/hqdefault.jpg' },
            { videoId: 'jg-uSq64Ru8', songName: 'Omokage (produced by Vaundy)', authorName: 'milet · Aimer · Lilas Ikuta', albumArt: 'https://i.ytimg.com/vi/jg-uSq64Ru8/hqdefault.jpg' },
            { videoId: 'OxiyIW2y1bg', songName: 'Her Blue Sky', authorName: '空の青さを知る人よ', albumArt: 'https://i.ytimg.com/vi/OxiyIW2y1bg/hqdefault.jpg' },
            { videoId: 'zP2uM7_EV1I', songName: 'カメレオン (Chameleon)', authorName: 'King Gnu', albumArt: 'https://i.ytimg.com/vi/zP2uM7_EV1I/hqdefault.jpg' },
            { videoId: 'Auq8qj7uuF0', songName: 'Shiori', authorName: 'SEKAI NO OWARI', albumArt: 'https://i.ytimg.com/vi/Auq8qj7uuF0/hqdefault.jpg' },
            { videoId: '12IZ8oyF6X4', songName: 'Shuhasu', authorName: 'SEKAI NO OWARI', albumArt: 'https://i.ytimg.com/vi/12IZ8oyF6X4/hqdefault.jpg' },
            { videoId: 'jTTuA0msOyg', songName: 'Present', authorName: 'SEKAI NO OWARI', albumArt: 'https://i.ytimg.com/vi/jTTuA0msOyg/hqdefault.jpg' },
            { videoId: 'gZFGA41Slh0', songName: 'Illumination', authorName: 'SEKAI NO OWARI', albumArt: 'https://i.ytimg.com/vi/gZFGA41Slh0/hqdefault.jpg' },
            { videoId: 'QlyW9kYHTDo', songName: 'Time Machine', authorName: 'SEKAI NO OWARI', albumArt: 'https://i.ytimg.com/vi/QlyW9kYHTDo/hqdefault.jpg' },
            { videoId: 'zOkIe3RcTCs', songName: 'LADY', authorName: '米津玄師 Kenshi Yonezu', albumArt: 'https://i.ytimg.com/vi/zOkIe3RcTCs/hqdefault.jpg' },
            { videoId: 'Ci_zad39Uhw', songName: '粛聖!! ロリ神レクイエム☆', authorName: 'しぐれうい', albumArt: 'https://i.ytimg.com/vi/Ci_zad39Uhw/hqdefault.jpg' },
            { videoId: 'eSW2LVbPThw', songName: 'Rabbit Hole feat. Hatsune Miku', authorName: 'DECO*27', albumArt: 'https://i.ytimg.com/vi/eSW2LVbPThw/hqdefault.jpg' },
            { videoId: 'uKxyLmbOc0Q', songName: 'Renai Circulation「恋愛サーキュレーション」', authorName: '＊なみりん (*Namirin)', albumArt: 'https://i.ytimg.com/vi/uKxyLmbOc0Q/hqdefault.jpg' },
            { videoId: 'RWFW1OSlMkM', songName: 'seisyun complex', authorName: 'kessoku band', albumArt: 'https://i.ytimg.com/vi/RWFW1OSlMkM/hqdefault.jpg' },
            { videoId: 'YjrSkBjDVEw', songName: 'Fukashigi no KARTE', authorName: 'Mai Sakurajima(CV:Asami Seto) · Tomoe Koga(CV:Nao Toyama) · Rio Futaba(CV:Atsumi Tanezaki) · Nodoka Toyohama(CV:Maaya Uchida) · Kaede Azusagawa(CV:Yurika Kubo) · Shoko Makinohara(CV:Inori Minase)', albumArt: 'https://i.ytimg.com/vi/YjrSkBjDVEw/hqdefault.jpg' },
            { videoId: 'IRsobBUcvCs', songName: 'DROPS (feat. Such)', authorName: 'Zekk · poplavor · Such', albumArt: 'https://i.ytimg.com/vi/IRsobBUcvCs/hqdefault.jpg' },
            { videoId: 'XkNai2JPIK8', songName: '導火', authorName: 'Tsukuyomi / YurryCanon', albumArt: 'https://i.ytimg.com/vi/XkNai2JPIK8/hqdefault.jpg' },
            { videoId: 'G96Qa5QoEfI', songName: '百花の約束 (feat. 夕凪夜)', authorName: '駒木優 / relier (Yu Komaki · Yoru Younagi)', albumArt: 'https://i.ytimg.com/vi/G96Qa5QoEfI/hqdefault.jpg' },
            { videoId: 'eF_wT8KwXlI', songName: 'Psyched Fevereiro', authorName: 't+pazolite', albumArt: 'https://i.ytimg.com/vi/eF_wT8KwXlI/hqdefault.jpg' },
            { videoId: 'TIz4dItDGjM', songName: 'J0YR1D3', authorName: 'BABii · Iglooghost · Pholo · Daisy Emily Warne', albumArt: 'https://i.ytimg.com/vi/TIz4dItDGjM/hqdefault.jpg' },
            { videoId: '95K19FUQlsM', songName: 'MOONLIGHT', authorName: '헨리 HENRY LAU', albumArt: 'https://i.ytimg.com/vi/95K19FUQlsM/hqdefault.jpg' },
            { videoId: 'ekr2nIex040', songName: 'APT.', authorName: 'ROSÉ & Bruno Mars', albumArt: 'https://i.ytimg.com/vi/ekr2nIex040/hqdefault.jpg' },
            { videoId: 'hJqYc62NCKo', songName: 'We\'ll Meet Again', authorName: 'TheFatRat & Laura Brehm', albumArt: 'https://i.ytimg.com/vi/hJqYc62NCKo/hqdefault.jpg' },
            { videoId: 'dpT-TeRYFvY', songName: 'All For Love', authorName: 'Tungevaag · Raaban · Richard Smitt', albumArt: 'https://i.ytimg.com/vi/dpT-TeRYFvY/hqdefault.jpg' },
        ];
    }
    renderPlaylist(playlist);
}

function savePlaylist() {
    localStorage.setItem('youtubeMusicPlaylist', JSON.stringify(playlist));
}

// Render playlist to the DOM
function renderPlaylist(songsToRender) {
    const songListElement = document.getElementById('songList');
    songListElement.innerHTML = ''; // Clear existing list

    if (songsToRender.length === 0) {
        songListElement.innerHTML = '<li class="list-group-item text-center text-muted">No songs in playlist. Add some using the YouTube search below!</li>';
        return;
    }

    songsToRender.forEach((song, index) => {
        const listItem = document.createElement('li');
        listItem.classList.add('list-group-item', 'd-flex', 'justify-content-between', 'align-items-center');
        listItem.setAttribute('data-video', song.videoId);
        listItem.setAttribute('data-img', song.albumArt);

        const songNumberSpan = document.createElement('span');
        songNumberSpan.classList.add('song-number');
        songNumberSpan.textContent = (index + 1) + ".\u00A0";

        const songDetailsSpan = document.createElement('span');
        songDetailsSpan.innerHTML = `<span class="song">${song.songName}</span>\n                                     <span class="author text-muted">${song.authorName}</span>`;

        const removeButton = document.createElement('button');
        removeButton.classList.add('btn', 'btn-danger', 'btn-sm', 'remove-song-btn');
        removeButton.innerHTML = ICON_TRASH; // Use constant
        removeButton.setAttribute('data-video', song.videoId); // Identify song to remove

        listItem.appendChild(songNumberSpan);
        listItem.appendChild(songDetailsSpan);
        listItem.appendChild(removeButton);

        songListElement.appendChild(listItem);

        // Add click listener to play song
        songDetailsSpan.addEventListener('click', function () {
            // Remove highlight from previous selection
            document.querySelectorAll('#songList li').forEach(li => li.classList.remove('selected'));
            // Highlight the clicked song
            listItem.classList.add('selected');

            loadNewVideo(song.videoId, song.albumArt, song);
            listItem.scrollIntoView({ behavior: "smooth", block: "nearest" });
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

    // Select the first song if none is selected and playlist is not empty
    if (!document.querySelector('#songList li.selected') && songsToRender.length > 0) {
        const firstSongElement = document.querySelector('#songList li');
        if (firstSongElement) {
            firstSongElement.classList.add('selected');
            const firstVideoId = firstSongElement.getAttribute('data-video');
            const firstAlbumArtUrl = firstSongElement.getAttribute('data-img');
            // Only load if player is not already playing this song
            if (player && player.getVideoData().video_id !== firstVideoId) {
                loadNewVideo(firstVideoId, firstAlbumArtUrl, songsToRender[0]);
            } else if (!player) {
                // Initialize player if not already done
                selectedVideoId = firstVideoId;
                onYouTubeIframeAPIReady();
            }
        }
    }
}

// Remove song functionality
function removeSong(videoIdToRemove) {
    const currentPlayingVideoId = player ? player.getVideoData().video_id : null;
    const wasPlayingCurrent = currentPlayingVideoId === videoIdToRemove && playing;

    playlist = playlist.filter(song => song.videoId !== videoIdToRemove);
    savePlaylist();
    renderPlaylist(playlist);

    // If the removed song was the currently playing one
    if (wasPlayingCurrent) {
        if (playlist.length > 0) {
            // Play the next song in the updated playlist
            playNextSong();
        } else {
            // If playlist is empty, stop playback and reset UI
            player.stopVideo();
            playing = false;
            document.getElementById('playPauseBtn').innerHTML = ICON_PLAY; // Use constant
            document.getElementById('albumArt').src = 'https://via.placeholder.com/300';
            document.getElementById('nowPlaying .song-title').innerText = 'No Song';
            document.getElementById('nowPlaying .author-name').innerText = '';
            document.getElementById('progress').style.width = '0%';
            document.getElementById('currentTime').innerText = '0:00';
            document.getElementById('totalTime').innerText = '0:00';
            document.getElementById('background').style.backgroundImage = 'none';
            clearInterval(progressInterval);
        }
    }
}

// Playlist Search functionality (for filtering the current playlist)
document.getElementById('searchPlaylistInput').addEventListener('input', function () {
    const searchTerm = this.value.toLowerCase();
    const filteredSongs = playlist.filter(song =>
        song.songName.toLowerCase().includes(searchTerm) ||
        song.authorName.toLowerCase().includes(searchTerm)
    );
    renderPlaylist(filteredSongs);
});

document.getElementById('clearPlaylistSearchBtn').addEventListener('click', function () {
    document.getElementById('searchPlaylistInput').value = '';
    renderPlaylist(playlist);
});

// YouTube Search Functionality
document.getElementById('youtubeSearchBtn').addEventListener('click', searchYouTube);
document.getElementById('youtubeSearchInput').addEventListener('keypress', function(event) {
    if (event.key === 'Enter') {
        searchYouTube();
    }
});

async function searchYouTube() {
    console.log("Attempting YouTube search...");
    console.log("API Key present: ", YOUTUBE_API_KEY && YOUTUBE_API_KEY.length > 10);

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

    if (!YOUTUBE_API_KEY || YOUTUBE_API_KEY === 'YOUR_YOUTUBE_API_KEY') {
        searchError.textContent = 'YouTube API Key is not configured. Please see README for instructions.';
        searchError.classList.remove('d-none');
        return;
    }

    searchLoading.classList.remove('d-none'); // Show loading indicator

    try {
        // Construct the URL for the YouTube API call
        const youtubeApiUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(searchTerm)}&type=video&maxResults=10&key=${YOUTUBE_API_KEY}`;
        
        // Prepend the CORS proxy URL to the YouTube API URL
        const proxiedUrl = `${CORS_PROXY_URL}${encodeURIComponent(youtubeApiUrl)}`;

        console.log("Fetching from proxied URL:", proxiedUrl);

        const response = await fetch(proxiedUrl);
        
        if (!response.ok) {
            const errorText = await response.text(); // Get raw text for more info
            console.error('YouTube API Error (via proxy):', response.status, response.statusText, errorText);
            searchError.textContent = `YouTube API Error: ${response.statusText}. Please check your API key and network.`;
            searchError.classList.remove('d-none');
            searchLoading.classList.add('d-none');
            return;
        }

        const data = await response.json();

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
                        <button class="btn btn-success btn-sm add-from-search-btn" 
                                data-video-id="${videoId}" 
                                data-song-title="${title.replace(/"/g, '&quot;')}" 
                                data-author-name="${channelTitle.replace(/"/g, '&quot;')}" 
                                data-album-art="${thumbnailUrl}">
                            ${ICON_PLUS} Add
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
        searchError.textContent = 'An unexpected error occurred while searching YouTube. Please try again.';
        searchError.classList.remove('d-none');
    }
}

function addSongFromSearch(event) {
    const button = event.currentTarget;
    const videoId = button.getAttribute('data-video-id');
    const songTitle = button.getAttribute('data-song-title');
    const authorName = button.getAttribute('data-author-name');
    const albumArt = button.getAttribute('data-album-art');

    // Check if song already exists
    const songExists = playlist.some(song => song.videoId === videoId);
    if (songExists) {
        alert('This song is already in your playlist!');
        return;
    }

    const newSong = { videoId, songName: songTitle, authorName, albumArt };
    playlist.push(newSong);
    savePlaylist();
    renderPlaylist(playlist);
    alert(`${songTitle} by ${authorName} added to your playlist!`);

    // Optional: Hide search results or clear search input after adding
    // document.getElementById('youtubeSearchInput').value = '';
    // document.getElementById('searchResults').classList.add('d-none');
}

// Set default song name and author to the first song
let lastSong = '';
let lastAuthor = '';

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
                event.target.setVolume(100);
                updateVolumeUI(100);
                event.target.playVideo();
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
        errorMsg.innerHTML = `⚠ This song is unavailable. Skipping in ${countdown} ...`;
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
                if (playing) {
                    albumArt.classList.add("rotate");
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
                songTitleElem.innerText = songName;
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
                        event.target.setVolume(100);
                        updateVolumeUI(100);
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
                } else {
                    console.error("Invalid or unsafe image URL:", absoluteImageUrl);
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

    function updateVolumeUI(volumeValue) {
        const progressBarWidth = volumeBarContainer.offsetWidth;
        const thumbWidth = volumeThumb.offsetWidth; 
        const thumbPosition = (volumeValue / 100) * (progressBarWidth - thumbWidth) + (thumbWidth / 2);

        volumeProgress.style.width = `${volumeValue}%`;
        volumeThumb.style.left = `${thumbPosition}px`;
    }

    volumeControl.addEventListener("input", function () {
        let volumeValue = this.value;
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
            } else {
                console.error("Invalid or unsafe image URL:", absoluteUrl);
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
            albumArt.classList.add("rotate-paused");
        } else {
            player.playVideo();
            this.innerHTML = ICON_PAUSE; // Use constant
            updateProgressBar();
            albumArt.classList.remove("rotate-paused");
            albumArt.classList.add("rotate");

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
    prevSongElement.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function playNextSong() {
    let songItems = document.querySelectorAll("#songList li");
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

    loadNewVideo(nextVideoId, nextAlbumArtUrl, nextSongObject);
    nextSongElement.scrollIntoView({ behavior: "smooth", block: "nearest" });
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
        albumArt.classList.remove("rotate-paused");
        albumArt.classList.add("rotate");
    }
}

document.getElementById("togglePlayerBtn").addEventListener("click", function () {
    let playerContainer = document.getElementById("playerContainer");

    if (playerContainer.classList.contains("d-none")) {
        playerContainer.classList.remove("d-none"); // Show player
        this.innerText = "Hide Player";
    } else {
        playerContainer.classList.add("d-none"); // Hide player
        this.innerText = "Show Player";
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
        this.innerHTML = isDarkMode ? "Disable" : "Enable";

        // Prevent rapid toggling
        setTimeout(() => {
            darkModeToggleInProgress = false;
        }, 600);
    });
});

function applyDarkModeToElements(enable) {
    document.querySelectorAll(
        ".card, .btn-dark-mode-toggle, .author-name, .song-title, box-icon, #songList, #songList .list-group-item, #songList .song, #songList .author, #searchResultsList .list-group-item, #searchResultsList h6, #searchResultsList p"
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