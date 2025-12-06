import { useEffect, useRef, useState } from 'react';
import { useFluidShader } from '../hooks/useFluidShader';
import { extractColors } from '../utils/colorExtractor';
import ExportWorker from '../workers/exportWorker.js?worker'; // Vite worker import syntax

const CoverGenerator = () => {
    // State
    const [imageSrc, setImageSrc] = useState(null);
    const [imageName, setImageName] = useState('cover'); // Store original filename
    const [colors, setColors] = useState([
        [0.8, 0.2, 0.2], [0.2, 0.8, 0.2], [0.2, 0.2, 0.8], [0.8, 0.8, 0.2], [0.5, 0.5, 0.5]
    ]);
    const [speed, setSpeed] = useState(1.0);
    const [resolution, setResolution] = useState({ width: 1920, height: 1080, label: '1080p' });
    const [fps, setFps] = useState(60);
    const [duration, setDuration] = useState(5);
    const [isExporting, setIsExporting] = useState(false);
    const [progress, setProgress] = useState(0);

    // Refs
    const canvasRef = useRef(null);
    const requestRef = useRef();
    const startTimeRef = useRef(Date.now());

    // Shader Hook
    const { renderFrame } = useFluidShader(
        canvasRef, 
        colors, 
        speed, 
        resolution.width, 
        resolution.height
    );

    // --- Real-time Preview Loop ---
    useEffect(() => {
        if (isExporting) return; // Pause preview during export to save GPU resources

        const animate = () => {
            const time = (Date.now() - startTimeRef.current) * 0.001;
            renderFrame(time);
            requestRef.current = requestAnimationFrame(animate);
        };
        requestRef.current = requestAnimationFrame(animate);

        return () => cancelAnimationFrame(requestRef.current);
    }, [isExporting, colors, speed, resolution]); 

    // --- Handle Image Upload ---
    const handleImageUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Extract filename without extension
        const name = file.name.replace(/\.[^/.]+$/, "");
        setImageName(name);

        const reader = new FileReader();
        reader.onload = (event) => {
            setImageSrc(event.target.result);
            const img = new Image();
            img.onload = () => {
                const extracted = extractColors(img);
                setColors(extracted);
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    };

    // --- Fast Export Logic (Worker Based) ---
    const handleExport = async () => {
        setIsExporting(true);
        setProgress(0);

        const worker = new ExportWorker();

        worker.onmessage = (e) => {
            const { type, percent, buffer, error } = e.data;

            if (type === 'PROGRESS') {
                setProgress(percent);
            } else if (type === 'DONE') {
                // Download
                const blob = new Blob([buffer], { type: 'video/mp4' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                
                a.download = `${imageName}_${resolution.label}_${fps}fps.mp4`;
                a.click();
                URL.revokeObjectURL(url);
                
                // Cleanup
                setIsExporting(false);
                worker.terminate();
                startTimeRef.current = Date.now(); // Reset preview time
            } else if (type === 'ERROR') {
                alert(`Export failed: ${error}`);
                setIsExporting(false);
                worker.terminate();
            }
        };

        // Start Worker
        worker.postMessage({
            type: 'START_EXPORT',
            payload: {
                width: resolution.width,
                height: resolution.height,
                fps,
                duration,
                speed,
                colors
            }
        });
    };

    return (
        <div className="flex h-screen bg-neutral-900 text-white font-sans overflow-hidden">
            {/* Controls Sidebar */}
            <div className="w-80 bg-black/80 p-6 flex flex-col gap-6 z-10 shadow-2xl overflow-y-auto">
                <h1 className="text-xl font-bold text-gray-200">Cover Background Generator</h1>
                
                {/* Image Upload */}
                <div className="flex flex-col gap-2">
                    <label className="bg-neutral-800 hover:bg-neutral-700 p-3 rounded-lg text-center cursor-pointer transition-colors">
                        Select Image
                        <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                    </label>
                    {imageSrc && (
                        <img src={imageSrc} alt="Preview" className="w-24 h-24 object-cover rounded-md border-2 border-neutral-700 mt-2" />
                    )}
                </div>

                {/* Speed */}
                <div className="flex flex-col gap-2">
                    <label className="text-sm text-gray-400 flex justify-between">
                        Speed <span>{speed}x</span>
                    </label>
                    <input 
                        type="range" min="0.1" max="5.0" step="0.1" value={speed}
                        onChange={e => setSpeed(parseFloat(e.target.value))}
                        className="w-full h-2 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                    />
                </div>

                {/* Resolution */}
                <div className="flex flex-col gap-2">
                    <label className="text-sm text-gray-400">Render Resolution</label>
                    <select 
                        className="bg-neutral-800 p-2 rounded-md text-sm border-none outline-none"
                        value={resolution.label}
                        onChange={(e) => {
                            const val = e.target.value;
                            if(val === '1080p') setResolution({ width: 1920, height: 1080, label: '1080p' });
                            if(val === '2K') setResolution({ width: 2560, height: 1440, label: '2K' });
                            if(val === '4K') setResolution({ width: 3840, height: 2160, label: '4K' });
                        }}
                    >
                        <option value="1080p">1080p (1920x1080)</option>
                        <option value="2K">2K (2560x1440)</option>
                        <option value="4K">4K (3840x2160)</option>
                    </select>
                </div>

                {/* FPS */}
                <div className="flex flex-col gap-2">
                    <label className="text-sm text-gray-400">FPS</label>
                    <select 
                        className="bg-neutral-800 p-2 rounded-md text-sm"
                        value={fps}
                        onChange={e => setFps(parseInt(e.target.value))}
                    >
                        <option value="24">24 FPS</option>
                        <option value="30">30 FPS</option>
                        <option value="60">60 FPS</option>
                    </select>
                </div>

                {/* Duration */}
                <div className="flex flex-col gap-2">
                    <label className="text-sm text-gray-400">Duration (s)</label>
                    <input 
                        type="number" min="1" value={duration}
                        onChange={e => setDuration(parseInt(e.target.value))}
                        className="bg-neutral-800 p-2 rounded-md text-sm"
                    />
                </div>

                {/* Export Button */}
                <div className="mt-auto">
                    <button 
                        onClick={handleExport}
                        disabled={isExporting}
                        className={`w-full py-3 rounded-lg font-bold text-sm transition-all
                            ${isExporting 
                                ? 'bg-neutral-700 text-gray-500 cursor-not-allowed' 
                                : 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg hover:shadow-blue-500/20'
                            }`}
                    >
                        {isExporting ? 'Rendering (Background)...' : 'Render (MP4)'}
                    </button>
                </div>
            </div>

            {/* Main Canvas Area */}
            <div className="flex-1 flex items-center justify-center bg-black relative">
                <canvas 
                    ref={canvasRef}
                    width={resolution.width}
                    height={resolution.height}
                    style={{ 
                        maxWidth: '100%', 
                        maxHeight: '100%', 
                        objectFit: 'contain',
                        aspectRatio: `${resolution.width}/${resolution.height}` 
                    }}
                    className="shadow-2xl"
                />

                {/* Overlay */}
                {isExporting && (
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center z-50">
                        <div className="w-96 bg-neutral-800 p-8 rounded-2xl shadow-2xl text-center">
                            <h2 className="text-2xl font-bold mb-4">Rendering</h2>
                            <div className="w-full h-3 bg-neutral-700 rounded-full overflow-hidden mb-4">
                                <div 
                                    className="h-full bg-blue-500 transition-all duration-100 ease-linear"
                                    style={{ width: `${progress}%` }}
                                />
                            </div>
                            <p className="text-gray-400">Progress: {progress}%</p>
                            <p className="text-xs text-gray-600 mt-2">Don't close this tab</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default CoverGenerator;