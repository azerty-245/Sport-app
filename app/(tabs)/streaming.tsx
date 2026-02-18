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

    const fetchData = useCallback(async () => {
        try {
            const [matchesData, channelsData, highlightsData, liveScoresData, myIPTVData] = await Promise.all([
                getAllStreaming(),
                getStreamingChannels(),
                fetchScoreBatHighlights(),
                fetchAllLiveScores(),
                getIPTVChannels()
            ]);

            // Process Matches (PrinceTech streams)
            const matchesRaw = (matchesData && matchesData.matches) || (Array.isArray(matchesData) ? matchesData : []) || [];
            setMatches(matchesRaw);

            // Process Live Scores (SofaScore + OpenLigaDB)
            setLiveScores(liveScoresData || []);

            // Process Channels - Use our verified premium IPTV + API channels
            const channelsRaw = (channelsData && channelsData.channels) || (Array.isArray(channelsData) ? channelsData : []) || [];
            const sanitizedAPIChannels = channelsRaw.map((c: any) => ({
                ...c,
                name: c.name || c.title || c.channel_name || 'Live Channel'
            }));

            // Our verified IPTV channels first, then API channels
            const allChannels = [...(myIPTVData || []), ...sanitizedAPIChannels];
            setChannels(allChannels);

            // Process Highlights
            setHighlights(highlightsData || []);
        } catch (err) {
            console.error('Error fetching streams:', err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    const onRefresh = () => {
        setRefreshing(true);
        fetchData();
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
            const finalUrl = rawUrl.includes('/api/iptv/stream') || rawUrl.includes(':3005/stream')
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
            <script src="https://cdn.jsdelivr.net/npm/hls.js@latest"><\/script>
            <style>
                body { margin:0; background:#000; overflow:hidden; display:flex; align-items:center; justify-content:center; height:100vh; }
                #video { border:0; width:100%; height:100vh; background:#000; }
                #status { position:fixed; top:10px; left:10px; color:#888; font-family:sans-serif; font-size:12px; z-index:10; }
            </style>
          </head>
          <body>
            <div id="status">Chargement du flux...</div>
            <div id="debug-log" style="position:fixed; bottom:50px; left:10px; color:#0f0; font-family:monospace; font-size:10px; z-index:100; background:rgba(0,0,0,0.5); pointer-events:none;"></div>
            <video id="video" controls autoplay playsinline></video>
            <script>
              var video = document.getElementById('video');
              var statusOverlay = document.getElementById('status');
              var debugLog = document.getElementById('debug-log');
              var src = '${url}';

              function log(msg) {
                console.log(msg);
                var div = document.createElement('div');
                div.textContent = '[' + new Date().toLocaleTimeString() + '] ' + msg;
                debugLog.appendChild(div);
                if (debugLog.children.length > 5) debugLog.removeChild(debugLog.firstChild);
              }

              function hideStatus() { if(statusOverlay) statusOverlay.style.display = 'none'; }

              log('Initialisation du lecteur...');

              // Listen for browser-level network issues
              window.addEventListener('offline', function() { log('⚠️ CONNEXION PERDUE (Check Wifi/4G)'); });
              window.addEventListener('online', function() { log('✅ CONNEXION RÉTABLIE'); });

              video.addEventListener('waiting', function() { log('⏳ Optimisation du flux (Lissage...)'); });
              video.addEventListener('stalled', function() { log('🚫 Flux arrêté (Problème serveur)'); });
              video.addEventListener('error', function() { log('❌ Erreur Lecteur: ' + (video.error ? video.error.message : 'Inconnue')); });

              // Try mpegts.js first (for MPEG-TS / FLV streams from IPTV servers)
              if (mpegts.isSupported()) {
                log('Mode MPEG-TS activé');
                var player = mpegts.createPlayer({
                  type: 'mpegts',
                  isLive: true,
                  url: src
                }, {
                  enableWorker: true,
                  liveBufferLatencyChasing: true, 
                  liveSync: true,                 
                  liveSyncTarget: 6.0,             // 6 seconds cushion for deep smoothing
                  liveBufferLatencyMaxLatency: 12.0, // Only jump if > 12s late
                  liveBufferLatencyMinLatency: 4.0,  // Keep at least 4s of data
                  enableStashBuffer: true,
                  stashInitialSize: 1024 * 1024, 
                  autoCleanupSourceBuffer: true,
                  autoCleanupMaxBackwardDuration: 20,
                  autoCleanupMinBackwardDuration: 10,
                  fixAudioTimestampGap: true,
                  lazyLoadMaxDuration: 20,
                });
                player.attachMediaElement(video);
                player.load();
                player.play().catch(function(e) { log('Autoplay bloqué'); });
                
                player.on(mpegts.Events.ERROR, function(errType, errDetail) {
                   log('❌ Erreur Flux: ' + errType + ' (' + errDetail + ')');
                   try { player.destroy(); } catch(e) {}
                   tryHLS();
                });
                
                setInterval(function() {
                  if (player.statisticsInfo) {
                    // Hidden debug info
                  }
                }, 3000);

                video.addEventListener('playing', function() {
                  log('▶️ Lecture en cours');
                  hideStatus();
                });
              } else {
                tryHLS();
              }

              function tryHLS() {
                log('Passage en mode HLS...');
                if (typeof Hls !== 'undefined' && Hls.isSupported()) {
                  var hls = new Hls({ enableWorker: true });
                  hls.loadSource(src);
                  hls.attachMedia(video);
                  hls.on(Hls.Events.MANIFEST_PARSED, function() {
                    video.play().catch(function(e) { log('HLS Autoplay failed'); });
                    hideStatus();
                  });
                  hls.on(Hls.Events.ERROR, function(event, data) {
                    if (data.fatal) { log('❌ Erreur HLS fatale'); tryDirect(); }
                  });
                } else {
                  tryDirect();
                }
              }

              function tryDirect() {
                log('Lecture HTML5 Directe...');
                video.src = src;
                video.addEventListener('loadedmetadata', function() {
                  video.play().catch(function(e) { log('Direct Autoplay failed'); });
                  hideStatus();
                });
                video.addEventListener('error', function() {
                   log('❌ Échec total de lecture');
                });
              }
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
            {renderTabContent()}

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
                            return (
                                <View style={{ flex: 1, width: '100%', maxWidth: 1000, alignSelf: 'center', justifyContent: 'center' }}>
                                    <View style={{ width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000' }}>
                                        <iframe
                                            src={content.type === 'uri' ? content.value : undefined}
                                            srcDoc={content.type === 'html' ? content.value : undefined}
                                            style={{ border: 'none', width: '100%', height: '100%' }}
                                            allowFullScreen
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
