(() => {
  'use strict';

  const video = document.getElementById('movie-video');
  const playButton = document.getElementById('play-button');
  const status = document.getElementById('playback-status');
  const errorBox = document.getElementById('playback-error');
  const resolution = document.getElementById('actual-resolution');
  const soundState = document.getElementById('sound-state');
  let film = null;
  let hls = null;
  let initialized = false;
  let disposed = false;
  let hasPlayed = false;
  let pendingPlay = false;
  let failed = false;
  let resumePosition = 0;
  let playbackEnded = false;
  let pendingNativeGeneration = null;
  let generation = 0;
  let loadTimer;
  let loadProgressTime = 0;
  let configController;

  // Keep this before configuration loading or any assignment of a media source.
  video.defaultMuted = true;
  video.muted = true;
  video.volume = 0;
  video.autoplay = false;

  function showStatus(message) {
    status.textContent = message;
  }

  function updateSound() {
    soundState.textContent = video.muted || video.volume === 0
      ? `静音 · 音量 ${Math.round(video.volume * 100)}`
      : `声音已开启 · 音量 ${Math.round(video.volume * 100)}`;
  }

  function updateResolution() {
    // Some manifests advertise the wrong size; only the decoded video is authoritative.
    if (video.videoWidth > 0 && video.videoHeight > 0) {
      resolution.textContent = `实际分辨率：${video.videoWidth} × ${video.videoHeight}`;
    }
  }

  function clearLoadTimer() {
    window.clearTimeout(loadTimer);
    loadTimer = undefined;
  }

  function releaseMedia() {
    generation += 1;
    clearLoadTimer();
    initialized = false;
    pendingPlay = false;
    pendingNativeGeneration = null;
    video.muted = true;
    video.volume = 0;
    video.pause();
    if (hls) {
      hls.destroy();
      hls = null;
    }
    video.removeAttribute('src');
    video.load();
  }

  function rememberPlaybackPosition() {
    if (!initialized || playbackEnded || pendingNativeGeneration !== null ||
        !Number.isFinite(video.currentTime) || video.currentTime < 0) return;
    // A retry can fail before its old position has been restored; keep that position.
    if (pendingPlay && video.currentTime === 0) return;
    if (video.readyState > 0 || video.currentTime > 0) resumePosition = video.currentTime;
  }

  function showError(message, retryable = true) {
    if (disposed) return;
    rememberPlaybackPosition();
    failed = true;
    releaseMedia();
    errorBox.textContent = message;
    errorBox.hidden = false;
    showStatus('暂时无法播放');
    playButton.disabled = !retryable || !film;
    playButton.textContent = retryable && film ? '重试播放（静音）' : '当前影片不可播放';
  }

  function startLoadTimer() {
    // Repeated waiting/stalled events must not postpone a genuine timeout.
    if (loadTimer !== undefined) return;
    loadProgressTime = video.currentTime;
    const expectedGeneration = generation;
    loadTimer = window.setTimeout(() => {
      loadTimer = undefined;
      if (disposed || failed || expectedGeneration !== generation || (video.paused && !pendingPlay)) return;
      // Background tabs may delay timeupdate events while the media keeps playing.
      if (!video.seeking && Number.isFinite(video.currentTime) && video.currentTime > loadProgressTime) {
        startLoadTimer();
        return;
      }
      showError('影片加载超时。请检查网络后重试；也可以查看下方的影片来源。');
    }, 30000);
  }

  function observeLoadProgress() {
    if (loadTimer === undefined || video.paused || video.seeking ||
        !Number.isFinite(video.currentTime) || video.currentTime <= loadProgressTime) return;
    clearLoadTimer();
    startLoadTimer();
    if (hasPlayed && !pendingPlay && video.readyState >= 3) showStatus('正在播放');
  }

  async function playMuted(expectedGeneration) {
    if (disposed || expectedGeneration !== generation) return;
    video.muted = true;
    video.volume = 0;
    try {
      await video.play();
    } catch (error) {
      if (disposed || expectedGeneration !== generation) return;
      if (error.name === 'NotAllowedError') {
        clearLoadTimer();
        pendingPlay = false;
        playButton.disabled = false;
        playButton.textContent = '开始播放（静音）';
        showStatus('请再次点击开始播放');
      } else {
        showError('播放器未能开始播放。请重试；如果仍然失败，当前线路可能暂时不可用。');
      }
    }
  }

  function beginPlayback() {
    if (!film || disposed || pendingPlay) return;
    if (playbackEnded || video.ended) {
      resumePosition = 0;
      playbackEnded = false;
      if (initialized) {
        try {
          video.currentTime = 0;
        } catch {
          releaseMedia();
        }
      }
    }
    errorBox.hidden = true;
    failed = false;
    pendingPlay = true;
    playButton.disabled = true;
    playButton.textContent = '正在加载…';
    showStatus('正在加载影片，保持静音');
    startLoadTimer();

    if (initialized) {
      void playMuted(generation);
      return;
    }

    initialized = true;
    const currentGeneration = generation;
    // A film may request supported native playback; otherwise prefer the bundled player.
    if ((film.playbackEngine === 'native' || !window.Hls || !window.Hls.isSupported()) &&
        video.canPlayType('application/vnd.apple.mpegurl')) {
      pendingNativeGeneration = currentGeneration;
      video.preload = 'metadata';
      video.src = film.mediaUrl;
      video.load();
    } else if (window.Hls && window.Hls.isSupported()) {
      hls = new window.Hls({
        enableWorker: true,
        autoStartLoad: true,
        backBufferLength: 10,
        maxBufferLength: 20,
        maxMaxBufferLength: 40,
        maxBufferSize: 20 * 1024 * 1024,
        startPosition: resumePosition,
      });
      hls.on(window.Hls.Events.MEDIA_ATTACHED, () => {
        if (!disposed && currentGeneration === generation) hls.loadSource(film.mediaUrl);
      });
      hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
        void playMuted(currentGeneration);
      });
      hls.on(window.Hls.Events.ERROR, (_event, data) => {
        if (disposed || currentGeneration !== generation || !data.fatal) return;
        if (data.type === window.Hls.ErrorTypes.NETWORK_ERROR) {
          showError('无法加载影片资源。可能是网络中断、来源限制或线路暂时失效，请稍后重试。');
        } else if (data.type === window.Hls.ErrorTypes.MEDIA_ERROR) {
          showError('浏览器无法解码这段影片。请重试，或使用支持此视频格式的浏览器。');
        } else {
          showError('当前线路暂时无法播放，请稍后重试或查看影片来源。');
        }
      });
      hls.attachMedia(video);
    } else {
      showError('此浏览器不支持当前视频格式。请使用较新版本的 Chrome、Edge 或 Safari。', false);
    }
  }

  function validatedFilm(config, id) {
    if (config.version !== 1 || !config.films || !Object.hasOwn(config.films, id)) {
      throw new Error('这部影片尚未接入放映室，请返回发票选择已有的观看入口。');
    }
    const selected = config.films[id];
    const verification = selected?.verification;
    let mediaUrl;
    let sourceUrl;
    try {
      mediaUrl = new URL(selected.mediaUrl);
      sourceUrl = new URL(selected.source.url);
    } catch {
      throw new Error('影片配置不完整，请返回发票后再试。');
    }
    if (mediaUrl.protocol !== 'https:' || sourceUrl.protocol !== 'https:' ||
        mediaUrl.username || mediaUrl.password || sourceUrl.username || sourceUrl.password ||
        !/\.m3u8$/i.test(mediaUrl.pathname) || !selected.title ||
        verification?.status !== 'verified' || verification.mediaUrl !== selected.mediaUrl ||
        verification.bilingual !== true || verification.subtitleMode !== 'embedded' ||
        !Number.isFinite(verification.width) || verification.width <= 0 ||
        !Number.isFinite(verification.height) || verification.height < 720) {
      throw new Error('这条线路的高清双语核验信息不完整，暂时无法在放映室播放。');
    }
    return selected;
  }

  async function loadConfiguration() {
    configController?.abort();
    releaseMedia();
    resumePosition = 0;
    playbackEnded = false;
    disposed = false;
    failed = false;
    film = null;
    hasPlayed = false;
    playButton.disabled = true;
    playButton.textContent = '正在准备…';
    errorBox.hidden = true;
    showStatus('正在读取影片信息');
    resolution.textContent = '实际分辨率：播放后读取';
    const params = new URLSearchParams(window.location.search);
    const filmId = params.get('film') || "toy-story";
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(filmId) || filmId.length > 100 || params.getAll('film').length > 1) {
      showError('观看链接中的影片编号无效，请返回发票重新打开。', false);
      return;
    }
    configController = new AbortController();
    const controller = configController;
    const configTimer = window.setTimeout(() => controller.abort(), 10000);
    try {
      // Only this fixed same-origin manifest can supply media URLs. Query parameters cannot.
      const response = await fetch('./movie-playback.json', {
        signal: controller.signal,
        cache: 'no-store',
        credentials: 'same-origin',
        mode: 'same-origin',
        redirect: 'error',
      });
      if (!response.ok) throw new Error('影片信息暂时无法读取，请刷新页面重试。');
      const config = await response.json();
      if (disposed || configController !== controller) return;
      film = validatedFilm(config, filmId);
      document.title = `${film.title} · 每日电影`;
      document.getElementById('film-title').textContent = film.title;
      document.getElementById('film-original-title').textContent = `${film.originalTitle} · ${film.year}`;
      document.getElementById('verified-quality').textContent = `高清 · ${film.verification.width} × ${film.verification.height}`;
      document.getElementById('subtitle-badge').textContent = film.verification.subtitleColor === 'white' ? '中英双语 · 白字' : '中英双语';
      document.getElementById('film-tags').hidden = false;
      document.getElementById('subtitle-note').textContent = `${film.verification.subtitles}。字幕已在画面中，无需另外开启。`;
      document.getElementById('verification-note').textContent = `核验于 ${film.verification.checkedOn}。播放器会读取实际解码分辨率。`;
      const sourceLink = document.getElementById('source-link');
      sourceLink.href = film.source.url;
      sourceLink.textContent = film.source.label;
      document.getElementById('source-note').hidden = false;
      video.setAttribute('aria-label', `${film.title}电影画面`);
      playButton.disabled = false;
      playButton.textContent = '开始播放（静音）';
      showStatus('已准备好，等待点击播放');
    } catch (error) {
      if (!disposed && configController === controller) {
        showError(error.name === 'AbortError' ? '影片信息读取超时，请刷新页面重试。' :
          error instanceof SyntaxError ? '影片信息格式有误，请返回发票后再试。' : error.message, false);
      }
    } finally {
      window.clearTimeout(configTimer);
    }
  }

  playButton.addEventListener('click', () => {
    if (!video.paused && !failed) video.pause();
    else beginPlayback();
  });
  video.addEventListener('playing', () => {
    if (disposed || failed) return;
    hasPlayed = true;
    pendingPlay = false;
    clearLoadTimer();
    errorBox.hidden = true;
    playButton.disabled = false;
    playButton.textContent = '暂停';
    showStatus('正在播放');
    updateResolution();
  });
  video.addEventListener('pause', () => {
    if (disposed || failed || !initialized || pendingPlay) return;
    clearLoadTimer();
    playButton.disabled = false;
    playButton.textContent = hasPlayed ? '继续播放（静音）' : '开始播放（静音）';
    showStatus('已暂停');
  });
  video.addEventListener('ended', () => {
    if (disposed || failed) return;
    playbackEnded = true;
    resumePosition = 0;
    clearLoadTimer();
    playButton.disabled = false;
    playButton.textContent = '重新播放（静音）';
    showStatus('已播放完毕');
  });
  for (const event of ['waiting', 'stalled']) {
    video.addEventListener(event, () => {
      if (disposed || failed || !initialized || (video.paused && !pendingPlay)) return;
      // A stalled download can still leave enough buffered video to keep playing.
      if (event === 'waiting' || video.readyState < 3) showStatus('正在缓冲…');
      startLoadTimer();
    });
  }
  video.addEventListener('error', () => {
    if (disposed || failed || !initialized || !video.error) return;
    showError(video.error.code === 2 ? '网络连接中断，影片暂时无法加载，请重试。' :
      '影片无法读取或解码，请重试；如持续失败，请查看下方影片来源。');
  });
  video.addEventListener('volumechange', updateSound);
  video.addEventListener('timeupdate', () => {
    if (!disposed && !failed) {
      rememberPlaybackPosition();
      observeLoadProgress();
    }
  });
  video.addEventListener('loadedmetadata', () => {
    updateResolution();
    const expectedGeneration = pendingNativeGeneration;
    if (expectedGeneration === null) return;
    pendingNativeGeneration = null;
    if (disposed || failed || !initialized || expectedGeneration !== generation) return;
    try {
      if (resumePosition > 0) video.currentTime = resumePosition;
    } catch {
      showError('暂时无法恢复播放进度，请重试。');
      return;
    }
    void playMuted(expectedGeneration);
  });
  video.addEventListener('resize', updateResolution);

  window.addEventListener('pagehide', () => {
    disposed = true;
    configController?.abort();
    releaseMedia();
  });
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) void loadConfiguration();
  });

  void loadConfiguration();
})();
