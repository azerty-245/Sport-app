import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Image, Modal, Platform, RefreshControl, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { WebView } from 'react-native-webview';
import LegalFooter from '../../components/LegalFooter';
import { ChannelSkeleton, HighlightSkeleton, MatchSkeleton } from '../../components/SkeletonCards';
import StreamCard from '../../components/StreamCard';
import { borderRadius, colors, fontSize, shadows, spacing } from '../../constants/theme';
import { getAllStreaming, getStreamingChannels } from '../../services/api';
import { fetchScoreBatHighlights } from '../../services/externalStreams';
import { fetchAllLiveScores } from '../../services/footballAPIs';
import { API_KEY, getIPTVChannels, STREAM_PROXY_URL } from '../../services/iptv';

type TabKey = 'channels' | 'highlights';

const TABS: { key: TabKey; label: string; icon: string }[] = [
    { key: 'channels', label: 'Live TV', icon: 'tv' },
    { key: 'highlights', label: 'Highlights', icon: 'videocam' },
];

// Simple fuzzy matching: checks if all characters of the query appear in order in the target
function fuzzyMatch(target: string, query: string): boolean {
    const t = target.toLowerCase();
    const q = query.toLowerCase();
    // First try simple includes
    if (t.includes(q)) return true;
    // Then try fuzzy: each character of query must appear in order
    let qi = 0;
    for (let i = 0; i < t.length && qi < q.length; i++) {
        if (t[i] === q[qi]) qi++;
    }
    return qi === q.length;
}

export default function StreamingScreen() {
    const [isMounted, setIsMounted] = useState(false);
    useEffect(() => {
        setIsMounted(true);
    }, []);

    const [activeTab, setActiveTab] = useState<TabKey>('channels');
    const [matches, setMatches] = useState<any[]>([]);
    const [liveScores, setLiveScores] = useState<any[]>([]);
    const [channels, setChannels] = useState<any[]>([]);
    const [highlights, setHighlights] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [selectedStream, setSelectedStream] = useState<any>(null);
    const [activeStreamIndex, setActiveStreamIndex] = useState(0);
    const [streamModalVisible, setStreamModalVisible] = useState(false);

    // Channel search
    const [channelSearchQuery, setChannelSearchQuery] = useState('');

    const flatListRef = useRef<FlatList>(null);

    const fetchData = useCallback(async (force = false) => {
        try {
            console.log(`[DEBUG] fetchData starting (force=${force})...`);
            const [matchesData, channelsData, highlightsData, liveScoresData, myIPTVData] = await Promise.all([
                getAllStreaming().catch(e => { console.warn('Matches API failed', e); return null; }),
                getStreamingChannels().catch(e => { console.warn('Channels API failed', e); return null; }),
                fetchScoreBatHighlights().catch(e => { console.warn('Highlights API failed', e); return null; }),
                fetchAllLiveScores().catch(e => { console.warn('LiveScores API failed', e); return null; }),
                getIPTVChannels(force).catch(e => { console.warn('IPTV API failed', e); return null; })
            ]);

            // Robust data processing - Always falling back to empty arrays
            const matchesRaw = (matchesData && typeof matchesData === 'object' && 'matches' in (matchesData as any))
                ? ((matchesData as any).matches || [])
                : (Array.isArray(matchesData) ? matchesData : []);
            setMatches(Array.isArray(matchesRaw) ? matchesRaw : []);

            setLiveScores(Array.isArray(liveScoresData) ? liveScoresData : []);

            const channelsRaw = (channelsData && typeof channelsData === 'object' && 'channels' in (channelsData as any))
                ? ((channelsData as any).channels || [])
                : (Array.isArray(channelsData) ? channelsData : []);

            const sanitizedAPIChannels = Array.isArray(channelsRaw)
                ? channelsRaw.map((c: any) => ({
                    ...c,
                    name: c?.name || c?.title || c?.channel_name || 'Live Channel'
                }))
                : [];

            const allChannels = [...(Array.isArray(myIPTVData) ? myIPTVData : []), ...sanitizedAPIChannels];
            setChannels(allChannels);

            setHighlights(Array.isArray(highlightsData) ? highlightsData : []);
            console.log(`[DEBUG] fetchData complete. Channels: ${allChannels.length}, Matches: ${matchesRaw.length}`);
        } catch (err) {
            console.error('CRITICAL Error in fetchData:', err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    const onRefresh = () => {
        setRefreshing(true);
        fetchData(true); // Force refresh to clear cache
    };

    // Filtered channels (from IPTV)
    const filteredChannels = useMemo(() => {
        if (!channelSearchQuery.trim()) return channels;
        return channels.filter(c => fuzzyMatch(c.name || '', channelSearchQuery.trim()));
    }, [channels, channelSearchQuery]);

    const clearChannelSearch = () => {
        setChannelSearchQuery('');
    };

    // ─── Stream opening ───
    const openStream = (item: any, type: 'match' | 'channel' | 'highlight') => {
        if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

        if (type === 'highlight') {
            setSelectedStream({
                id: item.id,
                homeTeam: item.title,
                awayTeam: item.competition,
                streams: [{ title: 'Highlight', url: item.embed }],
                isEmbed: true,
                originalUrl: item.url
            });
            setActiveStreamIndex(0);
            setStreamModalVisible(true);
            return;
        }

        let targetStream;
        if (type === 'channel') {
            const rawUrl = item.url;
            // Force direct Oracle VM proxy for streaming to avoid Vercel timeouts
            // Improved check: If it's already a stream proxy URL (direct or tunnel), use it as is.
            const isAlreadyProxied = rawUrl.includes('/stream?') ||
                rawUrl.includes(':3005/stream') ||
                rawUrl.includes('trycloudflare.com');

            const finalUrl = isAlreadyProxied
                ? rawUrl
                : `${STREAM_PROXY_URL}/stream?url=${encodeURIComponent(rawUrl)}&key=${API_KEY}`;
            targetStream = { title: 'Direct', url: finalUrl };
        } else {
            targetStream = item.streams?.[activeStreamIndex] || item.streams?.[0];
        }

        if (!targetStream?.url) {
            if (Platform.OS === 'web') alert('No stream URL available.');
            return;
        }

        if (type === 'channel') {
            setSelectedStream({
                id: item.id,
                homeTeam: item.name,
                awayTeam: item.category || 'Live TV',
                streams: [targetStream],
                isPriority: item.priority === 1
            });
        } else {
            setSelectedStream(item);
        }

        setActiveStreamIndex(0);
        setStreamModalVisible(true);
    };

    // ─── Stream content renderer ───
    const getStreamContent = () => {
        if (!selectedStream?.streams?.length) return null;
        const stream = selectedStream.streams[activeStreamIndex] || selectedStream.streams[0];
        const url = stream.url;

        if (selectedStream.isEmbed) {
            return {
                type: 'html',
                value: `<html>
                <head>
                    <meta name="viewport" content="width=device-width, initial-scale=1">
                    <style>body { margin: 0; background: #000; display: flex; align-items: center; justify-content: center; height: 100vh; }</style>
                </head>
                <body>
                    <div style="width: 100%; font-size: 0;">${url}</div>
                </body>
            </html>`,
                url: selectedStream.originalUrl || url
            };
        }

        if (url.includes('.m3u8')) {
            return {
                type: 'html',
                value: `<html>
          <head>
            <meta name="viewport" content="width=device-width,initial-scale=1">
            <script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
            <style>
                body { margin:0; background:#000; overflow:hidden; }
                #video { border:0; width:100%; height:100vh; background:#000; }
            </style>
          </head>
          <body>
            <video id="video" controls autoplay playsinline></video>
            <script>
              var video = document.getElementById('video');
              var src = ${JSON.stringify(url)};
              if (Hls.isSupported()) {
                var hls = new Hls({ enableWorker: true, lowLatencyMode: true });
                hls.loadSource(src);
                hls.attachMedia(video);
                hls.on(Hls.Events.MANIFEST_PARSED, function() { video.play().catch(e => console.log(e)); });
              } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                video.src = src;
                video.addEventListener('loadedmetadata', function() { video.play(); });
              }
            </script>
          </body>
        </html>`,
                url
            };
        }

        // For direct MPEG-TS / IPTV streams (Xtream Codes, etc.) — use mpegts.js
        return {
            type: 'html',
            value: `<html>
          <head>
            <meta name="viewport" content="width=device-width,initial-scale=1">
            <script src="https://cdn.jsdelivr.net/npm/mpegts.js@1.7.3/dist/mpegts.js"><\/script>
            <style>
                body { margin:0; background:#000; overflow:hidden; display:flex; align-items:center; justify-content:center; height:100vh; }
                #video { border:0; width:100%; height:100vh; background:#000; }
                #status { position:fixed; top:10px; left:10px; color:#aaa; font-family:sans-serif; font-size:13px; z-index:10; text-shadow: 0 1px 3px rgba(0,0,0,0.8); }
            </style>
          </head>
          <body>
            <div id="status">⏳ Connexion au flux...</div>
            <video id="video" controls playsinline></video>
            <script>
              var video = document.getElementById('video');
              var statusOverlay = document.getElementById('status');
              var src = '${url}';
              var MAX_RETRIES = 2;
              var retryCount = 0;
              var currentPlayer = null;
              var isPlaying = false;

              function log(msg) {
                console.log(msg);
                if (statusOverlay && !isPlaying) {
                  statusOverlay.textContent = msg;
                }
              }

              function hideStatus() {
                if (statusOverlay) statusOverlay.style.display = 'none';
                isPlaying = true;
              }

              log('Initialisation du lecteur...');

              // Listen for browser-level network issues
              window.addEventListener('offline', function() { log('⚠️ CONNEXION PERDUE'); });
              window.addEventListener('online', function() { log('✅ CONNEXION RÉTABLIE — Rechargement...'); setTimeout(function() { startPlayer(); }, 1000); });

              video.addEventListener('waiting', function() { if (!isPlaying) log('⏳ Optimisation du flux...'); });
              video.addEventListener('stalled', function() { log('⏳ Flux en attente du serveur...'); });

              function destroyPlayer() {
                if (currentPlayer) {
                  try { currentPlayer.pause(); } catch(e) {}
                  try { currentPlayer.unload(); } catch(e) {}
                  try { currentPlayer.detachMediaElement(); } catch(e) {}
                  try { currentPlayer.destroy(); } catch(e) {}
                  currentPlayer = null;
                }
                // Reset video element
                video.removeAttribute('src');
                video.load();
              }

              // --- HLS FALLBACK for Safari/iOS ---
              function startHlsPlayer() {
                log('📡 Demande de flux HLS au serveur...');
                // Build HLS URL from the MPEG-TS stream URL  
                var hlsUrl = src.replace('/stream?', '/hls?');
                // Extract the tunnel base URL for segment fetching
                var baseUrl = src.substring(0, src.indexOf('/stream'));
                
                fetch(hlsUrl)
                  .then(function(response) {
                    if (!response.ok) throw new Error('HLS HTTP ' + response.status);
                    return response.json();
                  })
                  .then(function(data) {
                    if (!data.session) throw new Error('No HLS session');
                    log('📋 Session HLS créée — Chargement...');
                    
                    // Build the playlist URL using the same tunnel base 
                    var playlistUrl = baseUrl + '/hls-data/' + data.session + '/live.m3u8?key=' + src.match(/key=([^&]*)/)[1];
                    
                    // Safari can play HLS natively
                    if (video.canPlayType('application/vnd.apple.mpegurl')) {
                      video.src = playlistUrl;
                      video.addEventListener('loadedmetadata', function onMeta() {
                        video.removeEventListener('loadedmetadata', onMeta);
                        log('▶️ Démarrage HLS...');
                        video.play().catch(function(e) {
                          log('⚠️ Cliquez sur la vidéo pour lancer la lecture');
                        });
                      });
                      video.addEventListener('playing', function onHlsPlaying() {
                        video.removeEventListener('playing', onHlsPlaying);
                        log('▶️ Lecture HLS en cours');
                        hideStatus();
                      });
                      video.addEventListener('error', function onHlsErr() {
                        video.removeEventListener('error', onHlsErr);
                        if (retryCount < MAX_RETRIES) {
                          retryCount++;
                          log('🔄 Retry HLS dans 3s...');
                          setTimeout(startHlsPlayer, 3000);
                        } else {
                          log('❌ Échec lecture HLS');
                        }
                      });
                    } else {
                      log('❌ Votre navigateur ne supporte ni MSE ni HLS');
                    }
                  })
                  .catch(function(err) {
                    log('⚠️ Erreur HLS: ' + err.message);
                    if (retryCount < MAX_RETRIES) {
                      retryCount++;
                      log('🔄 Retry dans 3s...');
                      setTimeout(startHlsPlayer, 3000);
                    } else {
                      log('❌ Impossible de démarrer le flux HLS');
                    }
                  });
              }

              function startPlayer() {
                destroyPlayer();
                isPlaying = false;

                // Safari/iOS: no MSE → use HLS fallback
                if (typeof mpegts === 'undefined' || !mpegts.isSupported()) {
                  log('📱 Safari détecté — Mode HLS...');
                  startHlsPlayer();
                  return;
                }

                var attempt = retryCount + 1;
                log('📡 Tentative ' + attempt + '/' + (MAX_RETRIES + 1) + ' — Connexion...');

                currentPlayer = mpegts.createPlayer({
                  type: 'mpegts',
                  isLive: true,
                  url: src
                }, {
                  enableWorker: true,
                  lazyLoad: false,
                  liveBufferLatencyChasing: false, // Disable chasing — let buffer grow
                  liveSync: false,
                  liveBufferLatencyMaxLatency: 30.0, // Allow up to 30s buffer
                  liveBufferLatencyMinLatency: 5.0,  // Keep at least 5s
                  enableStashBuffer: true,
                  stashInitialSize: 1024 * 1024, // 1MB stash (safe, absorbs bursts)
                  autoCleanupSourceBuffer: true,
                  autoCleanupMaxBackwardDuration: 30,
                  autoCleanupMinBackwardDuration: 15,
                  fixAudioTimestampGap: true,
                  lazyLoadMaxDuration: 60,
                });

                currentPlayer.attachMediaElement(video);
                currentPlayer.load();

                // Wait until we have at least 3s of buffer before starting playback
                var playStarted = false;
                function tryPlay() {
                  if (playStarted) return;
                  if (video.buffered.length > 0) {
                    var buffered = video.buffered.end(0) - video.buffered.start(0);
                    if (buffered >= 3.0) {
                      playStarted = true;
                      log('▶️ Buffer OK (' + buffered.toFixed(1) + 's) — Démarrage...');
                      video.play().catch(function(e) {
                        log('⚠️ Cliquez sur la vidéo pour lancer la lecture');
                      });
                      return;
                    }
                    log('⏳ Buffering... ' + buffered.toFixed(1) + 's / 3.0s');
                  }
                  setTimeout(tryPlay, 500);
                }
                // Start checking buffer after canplay fires
                video.addEventListener('canplay', function onCanPlay() {
                  video.removeEventListener('canplay', onCanPlay);
                  tryPlay();
                });

                video.addEventListener('playing', function onPlaying() {
                  video.removeEventListener('playing', onPlaying);
                  log('▶️ Lecture en cours');
                  hideStatus();
                });

                // --- DIAGNOSTICS: Monitor network & buffer ---
                if (mpegts.Events.STATISTICS_INFO) {
                  currentPlayer.on(mpegts.Events.STATISTICS_INFO, function(data) {
                    if (data.speed > 0) {
                      console.log('[DIAGNOSTIC] 🌐 Download Speed: ' + data.speed.toFixed(1) + ' KB/s');
                    }
                  });
                }

                setInterval(function() {
                  if (video.paused || !video.buffered.length) return;
                  var end = video.buffered.end(video.buffered.length - 1);
                  var bufferLeft = end - video.currentTime;
                  
                  if (bufferLeft < 0.5) {
                    console.warn('[DIAGNOSTIC] 📉 Buffer CRITICAL: ' + bufferLeft.toFixed(2) + 's (Stall expected)');
                  } else if (bufferLeft < 3.0) {
                    console.log('[DIAGNOSTIC] ⚠️ Buffer LOW: ' + bufferLeft.toFixed(2) + 's');
                  } else {
                     // Uncomment to see healthy buffer logs
                     // console.log('[DIAGNOSTIC] 🟢 Buffer OK: ' + bufferLeft.toFixed(2) + 's');
                  }
                }, 1000);
                // ---------------------------------------------

                // Error handling with retry
                currentPlayer.on(mpegts.Events.ERROR, function(errType, errDetail) {
                  log('⚠️ Erreur flux: ' + errType);
                  if (retryCount < MAX_RETRIES) {
                    retryCount++;
                    var delay = retryCount * 3;
                    log('🔄 Nouvelle tentative dans ' + delay + 's...');
                    setTimeout(function() { startPlayer(); }, delay * 1000);
                  } else {
                    log('❌ Impossible de lire ce flux après ' + (MAX_RETRIES + 1) + ' tentatives');
                  }
                });

                // Also handle video element errors (e.g. DEMUXER_ERROR)
                video.addEventListener('error', function onError() {
                  video.removeEventListener('error', onError);
                  var msg = video.error ? video.error.message : 'Erreur inconnue';
                  if (!isPlaying && retryCount < MAX_RETRIES) {
                    retryCount++;
                    var delay = retryCount * 3;
                    log('🔄 Erreur lecteur — Retry dans ' + delay + 's...');
                    setTimeout(function() { startPlayer(); }, delay * 1000);
                  } else if (!isPlaying) {
                    log('❌ Échec de lecture: ' + msg);
                  }
                });
              }

              // Start first attempt
              startPlayer();
            </script>
          </body>
        </html>`,
            url
        };
    };


    // ─── Renderers ───
    const renderChannelItem = ({ item }: { item: any }) => (
        <TouchableOpacity style={styles.channelCard} onPress={() => openStream(item, 'channel')}>
            <View style={styles.channelIconContainer}>
                <Ionicons name="tv-outline" size={24} color={colors.accent} />
            </View>
            <View style={styles.channelInfo}>
                <View style={styles.channelHeaderRow}>
                    <Text style={styles.channelName} numberOfLines={1}>{item.name}</Text>
                    {item.priority === 1 && (
                        <View style={styles.badge}>
                            <Text style={styles.badgeText}>HD</Text>
                        </View>
                    )}
                </View>
                <Text style={styles.channelCategory}>{item.category || 'Live TV'}</Text>
            </View>
            <Ionicons name="play-circle" size={28} color={colors.accent} />
        </TouchableOpacity>
    );

    const renderHighlightItem = ({ item }: { item: any }) => (
        <TouchableOpacity style={styles.highlightCard} onPress={() => openStream(item, 'highlight')}>
            <View style={styles.highlightThumbContainer}>
                <Image source={{ uri: item.thumbnail }} style={styles.highlightThumb} />
                <View style={styles.playOverlay}>
                    <Ionicons name="play" size={24} color="#fff" />
                </View>
            </View>
            <View style={styles.highlightInfo}>
                <Text style={styles.highlightTitle} numberOfLines={2}>{item.title}</Text>
                <Text style={styles.highlightMeta}>{item.competition}</Text>
            </View>
        </TouchableOpacity>
    );

    const renderMatchItem = ({ item }: { item: any }) => {
        // Live score items (from SofaScore/OpenLigaDB) - display only, no stream
        if (item.type === 'livescore') {
            return (
                <View style={styles.liveScoreCard}>
                    <View style={styles.liveScoreHeader}>
                        <View style={[styles.liveScoreBadge, item.isLive && styles.liveScoreBadgeLive]}>
                            <Text style={[styles.liveScoreBadgeText, item.isLive && styles.liveScoreBadgeTextLive]}>
                                {item.status}
                            </Text>
                        </View>
                        <Text style={styles.liveScoreSource}>{item.league}</Text>
                    </View>
                    <View style={styles.liveScoreTeams}>
                        <View style={styles.liveScoreTeamRow}>
                            {item.homeLogo ? (
                                <Image source={{ uri: item.homeLogo }} style={styles.liveScoreLogo} />
                            ) : (
                                <View style={[styles.liveScoreLogo, styles.liveScoreLogoPlaceholder]}>
                                    <Ionicons name="football" size={14} color={colors.textMuted} />
                                </View>
                            )}
                            <Text style={styles.liveScoreTeamName} numberOfLines={1}>{item.homeTeam}</Text>
                            <Text style={[styles.liveScoreScoreText, item.isLive && styles.liveScoreScoreLive]}>
                                {item.homeScore}
                            </Text>
                        </View>
                        <View style={styles.liveScoreTeamRow}>
                            {item.awayLogo ? (
                                <Image source={{ uri: item.awayLogo }} style={styles.liveScoreLogo} />
                            ) : (
                                <View style={[styles.liveScoreLogo, styles.liveScoreLogoPlaceholder]}>
                                    <Ionicons name="football" size={14} color={colors.textMuted} />
                                </View>
                            )}
                            <Text style={styles.liveScoreTeamName} numberOfLines={1}>{item.awayTeam}</Text>
                            <Text style={[styles.liveScoreScoreText, item.isLive && styles.liveScoreScoreLive]}>
                                {item.awayScore}
                            </Text>
                        </View>
                    </View>
                </View>
            );
        }
        return <StreamCard match={item} onPress={() => openStream(item, 'match')} />;
    };

    // ─── Scroll helpers ───
    const scrollToTop = () => {
        flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
        if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    };

    const scrollToBottom = () => {
        flatListRef.current?.scrollToEnd({ animated: true });
        if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    };

    // ─── Loading skeleton ───
    if (loading) {
        return (
            <View style={styles.container}>
                <View style={styles.list}>
                    <View style={{ height: 100 }} />
                    <MatchSkeleton />
                    <MatchSkeleton />
                    <ChannelSkeleton />
                    <ChannelSkeleton />
                    <HighlightSkeleton />
                </View>
            </View>
        );
    }

    // ─── Tab content ───
    const renderTabContent = () => {
        switch (activeTab) {
            case 'channels':
                return (
                    <FlatList
                        ref={flatListRef}
                        data={filteredChannels}
                        keyExtractor={(item, index) => (item.id || item.url || item.name || '') + index}
                        renderItem={renderChannelItem}
                        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
                        contentContainerStyle={styles.list}
                        showsVerticalScrollIndicator={false}
                        ListHeaderComponent={
                            <View>
                                {/* Search bar */}
                                <View style={styles.searchRow}>
                                    <View style={styles.searchInputWrapper}>
                                        <Ionicons name="search" size={18} color={colors.textMuted} />
                                        <TextInput
                                            style={styles.searchInput}
                                            placeholder="Rechercher une chaîne (BeIN, Canal...)"
                                            placeholderTextColor={colors.textMuted}
                                            value={channelSearchQuery}
                                            onChangeText={setChannelSearchQuery}
                                            returnKeyType="search"
                                        />
                                        {channelSearchQuery.length > 0 && (
                                            <TouchableOpacity onPress={clearChannelSearch}>
                                                <Ionicons name="close-circle" size={20} color={colors.textMuted} />
                                            </TouchableOpacity>
                                        )}
                                    </View>
                                </View>
                                {channelSearchQuery.trim() ? (
                                    <Text style={styles.searchResultsText}>
                                        {filteredChannels.length} résultat{filteredChannels.length !== 1 ? 's' : ''} pour "{channelSearchQuery}"
                                    </Text>
                                ) : (
                                    <View style={styles.tabHeader}>
                                        <Ionicons name="tv" size={20} color={colors.accent} />
                                        <Text style={styles.tabHeaderText}>{channels.length} Chaînes TV Disponibles</Text>
                                    </View>
                                )}
                            </View>
                        }
                        ListEmptyComponent={
                            <View style={styles.emptyContainer}>
                                <Ionicons name="tv-outline" size={64} color={colors.textMuted} />
                                <Text style={styles.emptyText}>
                                    {channelSearchQuery.trim() ? `Aucune chaîne trouvée pour "${channelSearchQuery}"` : 'Aucune chaîne disponible'}
                                </Text>
                                <Text style={styles.emptySubText}>
                                    {channelSearchQuery.trim() ? 'Essayez un autre mot-clé' : 'Tirez pour actualiser'}
                                </Text>
                            </View>
                        }
                        ListFooterComponent={<LegalFooter />}
                    />
                );

            case 'highlights':
                return (
                    <FlatList
                        ref={flatListRef}
                        data={highlights}
                        keyExtractor={(item, index) => (item.id || item.title || '') + index}
                        renderItem={renderHighlightItem}
                        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
                        contentContainerStyle={styles.list}
                        showsVerticalScrollIndicator={false}
                        ListHeaderComponent={
                            <View style={styles.tabHeader}>
                                <Ionicons name="videocam" size={20} color={colors.accent} />
                                <Text style={styles.tabHeaderText}>Match Highlights & Goals</Text>
                            </View>
                        }
                        ListEmptyComponent={
                            <View style={styles.emptyContainer}>
                                <Ionicons name="videocam-outline" size={64} color={colors.textMuted} />
                                <Text style={styles.emptyText}>No highlights available</Text>
                                <Text style={styles.emptySubText}>Check back after match days</Text>
                            </View>
                        }
                        ListFooterComponent={<LegalFooter />}
                    />
                );
        }
    };

    // Standard rendering with stability for hydration
    return (
        <View style={styles.container}>
            {/* Tab bar */}
            <View style={styles.tabBar}>
                {TABS.map(tab => (
                    <TouchableOpacity
                        key={tab.key}
                        style={[styles.tab, activeTab === tab.key && styles.tabActive]}
                        onPress={() => {
                            setActiveTab(tab.key);
                            if (Platform.OS !== 'web') Haptics.selectionAsync();
                        }}
                    >
                        <Ionicons
                            name={tab.icon as any}
                            size={18}
                            color={activeTab === tab.key ? colors.accent : colors.textMuted}
                        />
                        <Text style={[styles.tabLabel, activeTab === tab.key && styles.tabLabelActive]}>
                            {tab.label}
                        </Text>
                        {activeTab === tab.key && <View style={styles.tabIndicator} />}
                    </TouchableOpacity>
                ))}
            </View>

            {/* Tab content */}
            {isMounted ? renderTabContent() : <View style={{ flex: 1, backgroundColor: colors.background }} />}

            {/* Scroll Shortcuts */}
            <View style={styles.scrollShortcuts}>
                <TouchableOpacity style={styles.scrollBtn} onPress={scrollToTop}>
                    <Ionicons name="arrow-up" size={24} color={colors.text} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.scrollBtn} onPress={scrollToBottom}>
                    <Ionicons name="arrow-down" size={24} color={colors.text} />
                </TouchableOpacity>
            </View>

            {/* Stream Player Modal */}
            <Modal
                visible={streamModalVisible}
                animationType="slide"
                onRequestClose={() => setStreamModalVisible(false)}
            >
                <View style={styles.modalContainer}>
                    <View style={styles.modalHeader}>
                        <TouchableOpacity onPress={() => setStreamModalVisible(false)} style={styles.closeBtn}>
                            <Ionicons name="close" size={24} color={colors.text} />
                        </TouchableOpacity>
                        <Text style={styles.modalTitle} numberOfLines={1}>
                            {selectedStream?.homeTeam} {selectedStream?.awayTeam ? `vs ${selectedStream.awayTeam}` : ''}
                        </Text>
                        <TouchableOpacity
                            onPress={async () => {
                                // Clear cache and re-fetch before reloading player
                                setSelectedStream(null);
                                await fetchData();
                                setTimeout(() => setSelectedStream(selectedStream), 100);
                            }}
                            style={styles.actionBtn}
                        >
                            <Ionicons name="refresh" size={22} color={colors.accent} />
                        </TouchableOpacity>
                    </View>

                    {/* Stream selector */}
                    {selectedStream?.streams && selectedStream.streams.length > 1 && (
                        <View style={styles.streamSelector}>
                            {selectedStream.streams.map((s: any, i: number) => (
                                <TouchableOpacity
                                    key={i}
                                    style={[styles.streamTab, activeStreamIndex === i && styles.activeStreamTab]}
                                    onPress={() => setActiveStreamIndex(i)}
                                >
                                    <Text style={[styles.streamTabText, activeStreamIndex === i && styles.activeStreamTabText]}>
                                        {s.title || `Stream ${i + 1}`}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    )}

                    {(() => {
                        const content = getStreamContent();
                        if (!content || !isMounted) return null;

                        if (Platform.OS === 'web') {
                            // On Web, render the HTML content directly in an iframe with srcDoc
                            // This allows the mpegts.js/hls.js scripts inside content.value to execute
                            return (
                                <View style={{ flex: 1, width: '100%', maxWidth: 1000, alignSelf: 'center', justifyContent: 'center' }}>
                                    <View style={{ width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000' }}>
                                        <iframe
                                            srcDoc={content.type === 'html' ? content.value : undefined}
                                            src={content.type === 'uri' ? content.value : undefined}
                                            style={{ border: 'none', width: '100%', height: '100%' }}
                                            allowFullScreen
                                            allow="autoplay; encrypted-media"
                                            title="Stream"
                                        />
                                    </View>
                                </View>
                            );
                        }

                        return (
                            <WebView
                                source={content.type === 'uri' ? { uri: content.value } : { html: content.value }}
                                style={styles.webview}
                                javaScriptEnabled
                                domStorageEnabled
                                originWhitelist={['*']}
                                allowsFullscreenVideo
                                mediaPlaybackRequiresUserAction={false}
                            />
                        );
                    })()}
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    // ─── Tab bar ───
    tabBar: {
        flexDirection: 'row',
        backgroundColor: colors.card,
        borderBottomWidth: 1,
        borderBottomColor: colors.cardBorder,
        paddingHorizontal: spacing.sm,
    },
    tab: {
        flex: 1,
        alignItems: 'center',
        paddingVertical: spacing.md,
        gap: 4,
        position: 'relative',
    },
    tabActive: {},
    tabLabel: {
        color: colors.textMuted,
        fontSize: fontSize.xs,
        fontWeight: '600',
    },
    tabLabelActive: {
        color: colors.accent,
    },
    tabIndicator: {
        position: 'absolute',
        bottom: 0,
        left: '20%',
        right: '20%',
        height: 3,
        backgroundColor: colors.accent,
        borderTopLeftRadius: 3,
        borderTopRightRadius: 3,
    },
    // ─── Tab header ───
    tabHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        paddingVertical: spacing.md,
    },
    tabHeaderText: {
        color: colors.textSecondary,
        fontSize: fontSize.sm,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    // ─── Search ───
    searchRow: {
        flexDirection: 'row',
        paddingVertical: spacing.md,
        gap: spacing.sm,
    },
    searchInputWrapper: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.inputBg,
        borderRadius: borderRadius.md,
        paddingHorizontal: spacing.md,
        gap: spacing.sm,
        borderWidth: 1,
        borderColor: colors.cardBorder,
    },
    searchInput: {
        flex: 1,
        color: colors.text,
        fontSize: fontSize.md,
        paddingVertical: spacing.md,
    },
    searchBtn: {
        width: 48,
        height: 48,
        borderRadius: borderRadius.md,
        backgroundColor: colors.accent,
        justifyContent: 'center',
        alignItems: 'center',
    },
    searchResultsText: {
        color: colors.textSecondary,
        fontSize: fontSize.sm,
        marginBottom: spacing.md,
        fontStyle: 'italic',
    },
    // ─── Lists ───
    list: {
        paddingHorizontal: spacing.lg,
        paddingBottom: 100,
    },
    // ─── Channel card ───
    channelCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.card,
        borderRadius: borderRadius.lg,
        padding: spacing.md,
        marginBottom: spacing.md,
        borderWidth: 1,
        borderColor: colors.cardBorder,
        ...shadows.small,
    },
    channelIconContainer: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: colors.background,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: spacing.md,
    },
    channelInfo: {
        flex: 1,
    },
    channelHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
    },
    channelName: {
        color: colors.text,
        fontSize: fontSize.md,
        fontWeight: '600',
        flexShrink: 1,
    },
    channelCategory: {
        color: colors.textMuted,
        fontSize: fontSize.xs,
    },
    badge: {
        backgroundColor: colors.accentDim,
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
        borderWidth: 1,
        borderColor: colors.accent,
    },
    badgeText: {
        color: colors.accent,
        fontSize: 10,
        fontWeight: 'bold',
    },
    // ─── Highlight card ───
    highlightCard: {
        flexDirection: 'row',
        backgroundColor: colors.card,
        borderRadius: borderRadius.lg,
        marginBottom: spacing.md,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: colors.cardBorder,
    },
    highlightThumbContainer: {
        width: 120,
        height: 80,
        position: 'relative',
    },
    highlightThumb: {
        width: '100%',
        height: '100%',
        backgroundColor: colors.surface,
    },
    playOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.3)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    highlightInfo: {
        flex: 1,
        padding: spacing.sm,
        justifyContent: 'center',
    },
    highlightTitle: {
        color: colors.text,
        fontSize: fontSize.sm,
        fontWeight: '600',
    },
    highlightMeta: {
        color: colors.accent,
        fontSize: fontSize.xs,
        marginTop: 2,
    },
    // ─── Modal ───
    modalContainer: {
        flex: 1,
        backgroundColor: colors.background,
    },
    modalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: spacing.lg,
        gap: spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: colors.cardBorder,
        paddingTop: 50,
    },
    closeBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: colors.card,
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalTitle: {
        color: colors.text,
        fontSize: fontSize.lg,
        fontWeight: '700',
        flex: 1,
    },
    modalActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
    },
    actionBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: colors.card,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: colors.cardBorder,
    },
    streamSelector: {
        flexDirection: 'row',
        padding: spacing.md,
        gap: spacing.sm,
        flexWrap: 'wrap',
    },
    streamTab: {
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        backgroundColor: colors.accentDim,
        borderRadius: borderRadius.full,
        borderWidth: 1,
        borderColor: colors.accent,
    },
    streamTabText: {
        color: colors.accent,
        fontSize: fontSize.sm,
        fontWeight: '600',
    },
    activeStreamTab: {
        backgroundColor: colors.accent,
    },
    activeStreamTabText: {
        color: colors.background,
    },
    webview: {
        flex: 1,
        backgroundColor: '#000',
    },
    // ─── Empty & misc ───
    emptyContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 100,
    },
    emptyText: {
        color: colors.text,
        fontSize: fontSize.lg,
        fontWeight: '700',
        marginTop: spacing.lg,
        textAlign: 'center',
    },
    emptySubText: {
        color: colors.textMuted,
        fontSize: fontSize.md,
        textAlign: 'center',
        marginTop: spacing.sm,
        paddingHorizontal: spacing.xxl,
    },
    scrollShortcuts: {
        position: 'absolute',
        right: spacing.lg,
        bottom: 100,
        gap: spacing.md,
    },
    scrollBtn: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: colors.card,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: colors.cardBorder,
        ...shadows.small,
    },
    // ─── Live Score Cards ───
    liveScoreCard: {
        backgroundColor: colors.card,
        borderRadius: borderRadius.lg,
        padding: spacing.md,
        marginBottom: spacing.md,
        borderWidth: 1,
        borderColor: colors.cardBorder,
        ...shadows.small,
    },
    liveScoreHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: spacing.sm,
    },
    liveScoreBadge: {
        paddingHorizontal: spacing.sm,
        paddingVertical: 2,
        borderRadius: borderRadius.full,
        backgroundColor: colors.surface,
    },
    liveScoreBadgeLive: {
        backgroundColor: colors.liveDim,
    },
    liveScoreBadgeText: {
        fontSize: fontSize.xs,
        fontWeight: '700',
        color: colors.textMuted,
    },
    liveScoreBadgeTextLive: {
        color: colors.live,
    },
    liveScoreSource: {
        fontSize: fontSize.xs,
        color: colors.textSecondary,
        flexShrink: 1,
        textAlign: 'right',
    },
    liveScoreTeams: {
        gap: spacing.sm,
    },
    liveScoreTeamRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
    },
    liveScoreLogo: {
        width: 24,
        height: 24,
        borderRadius: 12,
    },
    liveScoreLogoPlaceholder: {
        backgroundColor: colors.surface,
        justifyContent: 'center',
        alignItems: 'center',
    },
    liveScoreTeamName: {
        flex: 1,
        color: colors.text,
        fontSize: fontSize.sm,
        fontWeight: '600',
    },
    liveScoreScoreText: {
        fontSize: fontSize.lg,
        fontWeight: '800',
        color: colors.text,
        minWidth: 24,
        textAlign: 'center',
    },
    liveScoreScoreLive: {
        color: colors.live,
    },
    // ─── Source Info ───
    sourceInfoRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: spacing.md,
    },
    sourceInfoText: {
        fontSize: fontSize.xs,
        color: colors.textSecondary,
        fontWeight: '600',
    },
});
