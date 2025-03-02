let player;
let playing = false;
let songUnavailable = false;
let progressInterval;
let isDragging = false;
let errorTimeout;
let selectedVideoId = "wX_y95OrHLQ";
let countdownInterval;
let darkModeToggleInProgress = false;

// Set default song name and author to the first song
let firstSongElement = document.querySelector("#songList li");
let lastSong = firstSongElement ? firstSongElement.querySelector(".song").innerText : "";
let lastAuthor = firstSongElement ? firstSongElement.querySelector(".author").innerText : "";

function onYouTubeIframeAPIReady() {
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
            'onReady': () => {
                player.setVolume(100);
                updateVolumeUI(100);
            },
            'onStateChange': handlePlayerStateChange, 
            'onError': handleVideoError
        }
    });
}

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

    playPauseBtn.innerHTML = "<i class='bx bx-play' style='color: white; font-size: 24px;'></i>";
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

function loadNewVideo(videoId, albumArtUrl, selectedSong = null) {
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
        }

        albumArt.onload = () => {
            setTimeout(() => {
                albumArt.style.opacity = "1";
                albumArt.classList.add("rotate");
            }, 500);
        };
    }, 500);

    updateBackgroundImage(albumArtUrl);

    let songTitleElem = document.querySelector("#nowPlaying .song-title");
    let authorNameElem = document.querySelector("#nowPlaying .author-name");

    if (selectedSong) {
        let songName = selectedSong.querySelector(".song").innerText;
        let authorName = selectedSong.querySelector(".author").innerText;

        if (songName !== lastSong || selectedSong === firstSongElement) {
            songTitleElem.style.transition = "opacity 0.5s ease-in-out";
            songTitleElem.style.opacity = "0";
            setTimeout(() => {
                songTitleElem.innerText = songName;
                songTitleElem.style.opacity = "1";
            }, 500);
            lastSong = songName;
        }

        if (authorName !== lastAuthor || selectedSong === firstSongElement) {
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
        onYouTubeIframeAPIReady();
        setTimeout(() => {
            player.loadVideoById(videoId);
            player.playVideo();
        }, 1000);
    } else {
        player.loadVideoById(videoId);
        player.playVideo();
    }

    // ✅ Reset progress bar and timer
    document.getElementById("progress").style.width = "0%";
    document.getElementById("currentTime").innerText = "0:00";
    document.getElementById("totalTime").innerText = "0:00";

    playing = true;
    document.getElementById("playPauseBtn").innerHTML = "<i class='bx bx-pause' style='color: white; font-size: 24px;'></i>";

    // ✅ Start tracking progress
    updateProgressBar();
}

// Handle song list selection (Click to Play)
document.querySelectorAll("#songList li").forEach(item => {
    item.addEventListener("click", function () {
        // ✅ Remove highlight from previous selection
        document.querySelectorAll("#songList li").forEach(li => li.classList.remove("selected"));

        // ✅ Highlight the clicked song
        this.classList.add("selected");

        // ✅ Get video details
        let videoId = this.getAttribute("data-video");
        let albumArtUrl = this.getAttribute("data-img");

        // ✅ Load new video with animation
        loadNewVideo(videoId, albumArtUrl, this);

        // ✅ Ensure the progress bar updates for the new song
        updateProgressBar();
    });
});

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

// Apply background change when clicking a song
document.querySelectorAll("#songList li").forEach((item, index) => {
    // Add numbering
    let numberSpan = document.createElement("span");
    numberSpan.classList.add("song-number");
    numberSpan.textContent = (index + 1) + ".\u00A0"; 
    item.prepend(numberSpan);

    // Handle song selection
    item.addEventListener("click", function () {
        let videoId = this.getAttribute("data-video");
        let albumArtUrl = this.getAttribute("data-img");

        loadNewVideo(videoId, albumArtUrl, this);
    });
});

// Set default selected song on page load
//
function isValidImageUrl(url) {
    try {
        let parsed = new URL(url);
        console.log("Checking image URL:", parsed.href);

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

    let firstSong = document.querySelector("#songList li");

    if (firstSong) {
        document.querySelectorAll("#songList li").forEach(li => li.classList.remove("selected"));
        firstSong.classList.add("selected");

        let firstImage = firstSong.getAttribute("data-img");
        let firstSongName = firstSong.querySelector(".song").innerText;
        let firstAuthorName = firstSong.querySelector(".author").innerText;

        if (firstImage) {
            let absoluteImageUrl = getAbsoluteUrl(firstImage);
            console.log("Resolved Image URL:", absoluteImageUrl);

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
//     

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

// Set default selected song
document.querySelector("#songList li").classList.add("selected");        

window.onload = function () {
    let firstSong = document.querySelector("#songList li");
    
    if (firstSong) {
        firstSong.classList.add("selected");

        let albumArtUrl = firstSong.getAttribute("data-img");

        if (albumArtUrl) {
            let absoluteUrl = getAbsoluteUrl(albumArtUrl);

            if (isValidImageUrl(absoluteUrl)) {
                let albumArt = document.getElementById("albumArt");
                if (albumArt) {
                    albumArt.setAttribute("src", absoluteUrl);
                } else {
                    console.error("Error: #albumArt element not found.");
                }
            } else {
                console.error("Invalid or unsafe image URL:", absoluteUrl);
            }
        } else {
            console.error("Error: No data-img attribute found.");
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
            this.innerHTML = "<i class='bx bx-play' style='color: white; font-size: 24px;'></i>"; // ✅ Play button
            clearInterval(progressInterval);
            albumArt.classList.add("rotate-paused");
        } else {
            player.playVideo();
            this.innerHTML = "<i class='bx bx-pause' style='color: white; font-size: 24px;'></i>"; // ✅ Pause button
            updateProgressBar();
            albumArt.classList.remove("rotate-paused");
            albumArt.classList.add("rotate");

            // ✅ If bx-revision is showing, reset it to Play/Pause
            if (this.innerHTML.includes("bx-revision")) {
                this.innerHTML = "<i class='bx bx-pause' style='color: white; font-size: 24px;'></i>";
            }
        }
        playing = !playing;
    }
});        

document.getElementById("prevBtn").addEventListener("click", playPreviousSong);
document.getElementById("nextBtn").addEventListener("click", playNextSong);

function playPreviousSong() {
    let songItems = document.querySelectorAll("#songList li");
    let currentSong = document.querySelector("#songList li.selected");

    let currentIndex = Array.from(songItems).indexOf(currentSong);
    let prevIndex = (currentIndex - 1 + songItems.length) % songItems.length;

    let prevSong = songItems[prevIndex];
    prevSong.classList.add("selected");
    currentSong.classList.remove("selected");

    let prevVideoId = prevSong.getAttribute("data-video");
    let prevAlbumArtUrl = prevSong.getAttribute("data-img");

    loadNewVideo(prevVideoId, prevAlbumArtUrl, prevSong);
    prevSong.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function playNextSong() {
    let songItems = document.querySelectorAll("#songList li");
    let currentSong = document.querySelector("#songList li.selected");

    let currentIndex = Array.from(songItems).indexOf(currentSong);
    let nextIndex = (currentIndex + 1) % songItems.length;

    let nextSong = songItems[nextIndex];
    nextSong.classList.add("selected");
    currentSong.classList.remove("selected");

    let nextVideoId = nextSong.getAttribute("data-video");
    let nextAlbumArtUrl = nextSong.getAttribute("data-img");

    loadNewVideo(nextVideoId, nextAlbumArtUrl, nextSong);
    nextSong.scrollIntoView({ behavior: "smooth", block: "nearest" });
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

                if (!autoPlayToggle) {
                    playPauseBtn.innerHTML = "<i class='bx bx-revision' style='color: white; font-size: 24px;'></i>";
                } else {
                    playPauseBtn.innerHTML = "<i class='bx bx-play' style='color: white; font-size: 24px;'></i>";
                }
                playing = false;
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
    let clickPosition = event.clientX - progressBar.getBoundingClientRect().left;
    let seekTime = (clickPosition / barWidth) * player.getDuration();

    if (player) {
        player.seekTo(seekTime, true);

        if (!wasPlaying) {
            player.pauseVideo(); // Prevent auto-play if the user was just seeking
        }

        let progressPercent = (seekTime / player.getDuration()) * 100;
        progress.style.width = progressPercent + "%";
    }
}

document.addEventListener("mousemove", function(event) {
    if (isDragging) {
        seek(event);
    }
});

document.addEventListener("mouseup", function(event) {
    if (isDragging) {
        isDragging = false;
        if (!playing) {
            player.pauseVideo(); // Don't auto-play if the song was paused
        }
    }
});

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
    let touchX = event.clientX - bar.getBoundingClientRect().left;
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
            playPauseBtn.innerHTML = "<i class='bx bx-revision' style='color: white; font-size: 24px;'></i>";
        }
    } else if (event.data === 2) { // ✅ 2 means PAUSED
        playPauseBtn.innerHTML = "<i class='bx bx-play' style='color: white; font-size: 24px;'></i>";
        playing = false;
        albumArt.classList.add("rotate-paused");
    } else if (event.data === 1) { // ✅ 1 means PLAYING
        playPauseBtn.innerHTML = "<i class='bx bx-pause' style='color: white; font-size: 24px;'></i>";
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
        ".card, .btn-dark-mode-toggle, .author-name, .song-title, #songList .list-group-item, #songList .song, #songList .author"
    ).forEach(el => {
        el.classList.toggle("dark-mode", enable);
    });

    // Ensure song title and author color updates correctly
    document.querySelectorAll("#nowPlaying .song-title, #nowPlaying .author-name")
        .forEach(elem => {
            elem.style.transition = "opacity 0.5s ease-in-out, color 0.8s ease-in-out";
            elem.style.color = enable ? "white" : "black";
        });

    // Ensure the selected song in the list remains readable
    document.querySelectorAll("#songList .list-group-item.selected").forEach(item => {
        item.style.backgroundColor = "#007bff"; // Ensure selection color stays
        item.style.color = "white"; // Keep selected text white
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