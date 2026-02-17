import time
import requests
import sys

# CONFIGURATION
PROXY_URL = "http://152.70.45.91:3005"
API_KEY = "sport-zone-secure-v1"
TEST_DURATION = 10  # Seconds to test each source
CHANNELS_TO_TEST = 1 # Number of random channels to test

def benchmark_source(index):
    print(f"\n--- 🧪 TEST SOURCE #{index} ---")
    
    # 1. Fetch Playlist for this specific source
    start_time = time.time()
    try:
        playlist_url = f"{PROXY_URL}/playlist?key={API_KEY}&src={index}"
        resp = requests.get(playlist_url, timeout=10)
        fetch_time = time.time() - start_time
        
        if resp.status_code != 200:
            print(f"❌ FAIL: Playlist fetch error (Status {resp.status_code})")
            return None
            
        print(f"✅ Playlist Load: {fetch_time:.2f}s")
        
        # Parse first available channel
        lines = resp.text.split('\n')
        stream_path = None
        for line in lines:
            if line.startswith('/stream'):
                stream_path = line.strip()
                break
        
        if not stream_path:
            print("❌ FAIL: No channels found in this source.")
            return None

        # 2. Test Stream Stability
        stream_url = f"{PROXY_URL}{stream_path}"
        print(f"📡 Testing Stream: {stream_url[:60]}...")
        
        connect_start = time.time()
        stream_resp = requests.get(stream_url, stream=True, timeout=15)
        connect_time = time.time() - connect_start
        
        if stream_resp.status_code != 200:
            print(f"❌ FAIL: Stream connection error (Status {stream_resp.status_code})")
            return None
            
        print(f"✅ Connection Speed: {connect_time:.2f}s (Time to play)")

        # Download data for X seconds and measure bitrate
        bytes_received = 0
        chunks_count = 0
        test_start = time.time()
        
        try:
            for chunk in stream_resp.iter_content(chunk_size=1024*64):
                bytes_received += len(chunk)
                chunks_count += 1
                elapsed = time.time() - test_start
                if elapsed > TEST_DURATION:
                    break
        except Exception as e:
            print(f"⚠️ Warning: Stream interrupted during test: {e}")

        total_time = time.time() - test_start
        bitrate_kbps = (bytes_received * 8) / (total_time * 1024)
        
        print(f"📊 Results Source #{index}:")
        print(f"   - Bitrate: {bitrate_kbps:.0f} kbps")
        print(f"   - Data: {bytes_received / (1024*1024):.2f} MB received in {total_time:.1f}s")
        print(f"   - Quality Score: {'⭐⭐⭐⭐⭐' if bitrate_kbps > 2000 else '⭐⭐⭐' if bitrate_kbps > 800 else '⭐'}")
        
    except Exception as e:
        print(f"❌ CRITICAL ERROR: {e}")

if __name__ == "__main__":
    print("🚀 EBEN IPTV BENCHMARK TOOL")
    print("---------------------------")
    for i in range(4):
        benchmark_source(i)
        time.sleep(2) # Cooldown between tests
    print("\n✅ Benchmark Finished. Check server logs (pm2 logs) for FFmpeg internal stability.")
