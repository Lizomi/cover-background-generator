// Simple WebM Muxer adapted for single video track
// Based on webm-muxer.js concepts

class WebMMuxer {
    constructor(options) {
        this.target = options.target; // 'buffer' or FileSystemWritableFileStream
        this.videoChunkQueue = [];
        this.segmentDataOffset = 0;
        this.segmentContentOffset = 0;
        this.width = options.video.width;
        this.height = options.video.height;
        this.frameRate = options.video.frameRate;
        
        this.buffer = []; // Simple array buffer for 'buffer' target
        
        this.writeHeader();
    }

    writeHeader() {
        // EBML Header
        this.writeBlob(new Uint8Array([
            0x1A, 0x45, 0xDF, 0xA3, // EBML ID
            0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x1F, // Size (placeholder)
            0x42, 0x86, 0x81, 0x01, // EBMLVersion = 1
            0x42, 0xF7, 0x81, 0x01, // EBMLReadVersion = 1
            0x42, 0xF2, 0x81, 0x04, // EBMLMaxIDLength = 4
            0x42, 0xF3, 0x81, 0x08, // EBMLMaxSizeLength = 8
            0x42, 0x82, 0x84, 0x77, 0x65, 0x62, 0x6D, // DocType = "webm"
            0x42, 0x87, 0x81, 0x02, // DocTypeVersion = 2
            0x42, 0x85, 0x81, 0x02  // DocTypeReadVersion = 2
        ]));

        // Segment
        this.writeBlob(new Uint8Array([0x18, 0x53, 0x80, 0x67])); // Segment ID
        this.writeBlob(new Uint8Array([0x01, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF])); // Unknown size (streaming)
        
        // SeekHead (Optional, skipped for simplicity)

        // Info
        this.writeBlob(new Uint8Array([0x15, 0x49, 0xA9, 0x66])); // Info ID
        this.writeBlob(new Uint8Array([0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x18])); // Size
        
        // TimecodeScale
        this.writeBlob(new Uint8Array([0x2A, 0xD7, 0xB1])); // TimecodeScale ID
        this.writeBlob(new Uint8Array([0x0F, 0x42, 0x40])); // 1,000,000 (1ms)

        // MuxingApp
        this.writeBlob(new Uint8Array([0x4D, 0x80, 0x84, 0x47, 0x65, 0x6D, 0x69])); // "Gemi"

        // WritingApp
        this.writeBlob(new Uint8Array([0x57, 0x41, 0x84, 0x47, 0x65, 0x6D, 0x69])); // "Gemi"


        // Tracks
        this.writeBlob(new Uint8Array([0x16, 0x54, 0xAE, 0x6B])); // Tracks ID
        // Track Entry Size is hard to predict, using a very simple structure
        // We need to construct the Track Entry manually to calculate size
        
        const trackEntry = [
            0xD7, 0x81, 0x01, // TrackNumber = 1
            0x73, 0xC5, 0x81, 0x01, // TrackUID = 1
            0x83, 0x81, 0x01, // TrackType = 1 (Video)
            0x9C, 0x81, 0x00, // FlagLacing = 0
            0x86, 0x85, 0x56, 0x5F, 0x56, 0x50, 0x39, // CodecID = "V_VP9"
            // Video settings
            0xE0, // Video ID
            0x80 | (6), // Size (6 bytes: 2 for width, 2 for height, 2 tags)
            0xB0, 0x82, (this.width >> 8) & 0xFF, this.width & 0xFF, // PixelWidth
            0xBA, 0x82, (this.height >> 8) & 0xFF, this.height & 0xFF // PixelHeight
        ];
        
        // Recalculate size for TrackEntry including Video settings
        // Simplified: just writing a fixed buffer for this specific use case
        // Proper implementation requires recursive EBML writer.
        
        // Let's use a simpler approach: Write chunks directly, assuming browser playback compatibility
        // which is lenient.
        
        // Re-doing Tracks with proper length calculation is complex without a helper.
        // I will use a Minimal header strategy.
        
        // TrackEntry
        this.writeBox(0xAE, [
            [0xD7, 1], // TrackNumber
            [0x73, 1], // TrackUID
            [0x83, 1], // TrackType (Video)
            [0x86, "V_VP9"], // CodecID
            [0xE0, [ // Video
                [0xB0, this.width],
                [0xBA, this.height]
            ]]
        ]);
    }
    
    // Simple EBML writer helpers
    writeBox(id, data) {
        // Convert ID to bytes
        let idBytes = [];
        if (id > 0xFFFFFF) idBytes = [(id>>24)&0xFF, (id>>16)&0xFF, (id>>8)&0xFF, id&0xFF];
        else if (id > 0xFFFF) idBytes = [(id>>16)&0xFF, (id>>8)&0xFF, id&0xFF];
        else if (id > 0xFF) idBytes = [(id>>8)&0xFF, id&0xFF];
        else idBytes = [id];

        this.writeBlob(new Uint8Array(idBytes));

        // Calculate size
        let size = 0;
        let payload = [];

        if (Array.isArray(data)) {
            // It's a container or list of properties
            for (let item of data) {
                if (Array.isArray(item)) {
                    // [ID, Value]
                    let subId = item[0];
                    let subVal = item[1];
                    let subBytes = this.serializeBox(subId, subVal);
                    payload.push(subBytes);
                    size += subBytes.length;
                }
            }
        }

        // Write Size (Variable length int)
        this.writeVarInt(size);
        
        // Write Payload
        for (let p of payload) {
            this.writeBlob(p);
        }
    }

    serializeBox(id, value) {
         // Convert ID to bytes
        let idBytes = [];
        if (id > 0xFFFFFF) idBytes = [(id>>24)&0xFF, (id>>16)&0xFF, (id>>8)&0xFF, id&0xFF];
        else if (id > 0xFFFF) idBytes = [(id>>16)&0xFF, (id>>8)&0xFF, id&0xFF];
        else if (id > 0xFF) idBytes = [(id>>8)&0xFF, id&0xFF];
        else idBytes = [id];

        let valBytes = [];
        if (typeof value === 'string') {
            for (let i = 0; i < value.length; i++) valBytes.push(value.charCodeAt(i));
        } else if (typeof value === 'number') {
             // Assuming integer for simplicity in this limited scope
             // For width/height (up to 4096) 2 bytes is usually enough, but let's be safe
             if (value > 0xFFFF) valBytes = [(value>>16)&0xFF, (value>>8)&0xFF, value&0xFF];
             else if (value > 0xFF) valBytes = [(value>>8)&0xFF, value&0xFF];
             else valBytes = [value];
        } else if (Array.isArray(value)) {
             // Nested
            for (let item of value) {
                 let sub = this.serializeBox(item[0], item[1]);
                 for(let b of sub) valBytes.push(b);
            }
        }

        let size = valBytes.length;
        let sizeBytes = this.getVarIntBytes(size);

        return new Uint8Array([...idBytes, ...sizeBytes, ...valBytes]);
    }

    writeVarInt(value) {
        let bytes = this.getVarIntBytes(value);
        this.writeBlob(new Uint8Array(bytes));
    }

    getVarIntBytes(value) {
        let bytes = [];
        if (value < 127) {
            bytes.push(value | 0x80);
        } else if (value < 16383) {
            bytes.push((value >> 8) | 0x40);
            bytes.push(value & 0xFF);
        } else if (value < 2097151) {
            bytes.push((value >> 16) | 0x20);
            bytes.push((value >> 8) & 0xFF);
            bytes.push(value & 0xFF);
        } else {
             // Larger sizes not implemented for this simple muxer
             // Just force 4 bytes
             bytes.push((value >> 24) | 0x10);
             bytes.push((value >> 16) & 0xFF);
             bytes.push((value >> 8) & 0xFF);
             bytes.push(value & 0xFF);
        }
        return bytes;
    }

    addVideoChunk(chunk, meta) {
        // Simple Cluster creation for each chunk (inefficient but easiest for streaming)
        // A Cluster contains a Timecode and a SimpleBlock
        
        // Cluster ID = 0x1F43B675
        // Timecode ID = 0xE7 (relative to Segment)
        // SimpleBlock ID = 0xA3
        
        let data = new Uint8Array(chunk.byteLength);
        chunk.copyTo(data);

        let timecode = chunk.timestamp / 1000; // Convert us to ms
        
        // We need to group chunks into Clusters to avoid massive overhead
        // But for this MVP, one cluster per chunk is safest logic-wise
        
        // Construct SimpleBlock
        // Header: TrackNum (VINT) + Timecode (Int16) + Flags (1 byte)
        // TrackNum = 1 (0x81)
        // Timecode = relative to Cluster, so 0 if we make new cluster per frame? 
        // Ideally we have one Cluster, and increasing relative timecodes.
        // But Cluster timecode is Uint, Block timecode is SInt16 (-32768 to +32767).
        // So a Cluster can hold ~32 seconds.
        
        // Let's make a new Cluster every keyframe or every 30 seconds.
        // For simplicity: New Cluster every frame. Overhead is negligible for local file generation.
        
        let blockHeader = [0x81, 0x00, 0x00, 0x80]; // Track 1, Time 0, Keyframe (0x80)
        if (chunk.type === 'key') blockHeader[3] = 0x80;
        else blockHeader[3] = 0x00; 
        
        let simpleBlockData = new Uint8Array(blockHeader.length + data.length);
        simpleBlockData.set(blockHeader, 0);
        simpleBlockData.set(data, blockHeader.length);
        
        let clusterPayload = this.serializeBox(0xE7, Math.round(timecode)); // Cluster Timecode
        // Add SimpleBlock manually
        // Block ID 0xA3
        let blockBytes = this.getVarIntBytes(simpleBlockData.length);
        let simpleBlockTag = new Uint8Array([0xA3, ...blockBytes]);
        
        // Combine payload
        let finalClusterSize = clusterPayload.length + simpleBlockTag.length + simpleBlockData.length;
        let clusterSizeVarInt = this.getVarIntBytes(finalClusterSize);
        
        this.writeBlob(new Uint8Array([0x1F, 0x43, 0xB6, 0x75])); // Cluster ID
        this.writeBlob(new Uint8Array(clusterSizeVarInt));
        this.writeBlob(clusterPayload);
        this.writeBlob(simpleBlockTag);
        this.writeBlob(simpleBlockData);
    }

    writeBlob(data) {
        if (this.target instanceof Array) {
            this.target.push(data);
        }
    }
    
    finalize() {
        return new Blob(this.buffer, { type: 'video/webm' });
    }
}
