'use client';

import React, { useMemo, useState, useRef, useEffect } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { BookMetadata } from '@/app/types/book';

interface BookCloud3DProps {
    books?: BookMetadata[];
    onBookClick: (book: BookMetadata) => void;
    onClose?: () => void;
}

function createFallbackTexture(title: string, author?: string): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1400;
    const ctx = canvas.getContext('2d');

    if (ctx) {
        const grad = ctx.createLinearGradient(0, 0, 1024, 1400);
        grad.addColorStop(0, '#1e1b4b');
        grad.addColorStop(1, '#0f172a');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 1024, 1400);

        ctx.strokeStyle = '#818cf8';
        ctx.lineWidth = 20;
        ctx.strokeRect(40, 40, 944, 1320);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 68px sans-serif';
        ctx.textAlign = 'center';

        const words = (title || 'Untitled').split(' ');
        let line = '';
        let y = 400;
        for (let i = 0; i < words.length; i++) {
            const testLine = line + words[i] + ' ';
            if (ctx.measureText(testLine).width > 800 && i > 0) {
                ctx.fillText(line, 512, y);
                line = words[i] + ' ';
                y += 85;
            } else {
                line = testLine;
            }
        }
        ctx.fillText(line, 512, y);

        if (author) {
            ctx.fillStyle = '#c7d2fe';
            ctx.font = '48px sans-serif';
            ctx.fillText(author, 512, y + 120);
        }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
}

interface DraggableMeshProps {
    book: BookMetadata & { coverFileName?: string };
    initialPosition: [number, number, number];
    initialRotation: [number, number, number];
    onBookClick: (book: BookMetadata) => void;
    onDragStateChange: (dragging: boolean) => void;
}

function DraggableMeshBook({
    book,
    initialPosition,
    initialRotation,
    onBookClick,
    onDragStateChange,
}: DraggableMeshProps) {
    const meshRef = useRef<THREE.Mesh>(null);
    const [texture, setTexture] = useState<THREE.Texture>(() =>
        createFallbackTexture(book.title, book.author)
    );
    const [hovered, setHovered] = useState(false);
    const [isDragging, setIsDragging] = useState(false);

    const { camera, raycaster, gl } = useThree();
    const dragPlane = useRef(new THREE.Plane());
    const planeIntersect = useRef(new THREE.Vector3());
    const pointerStartPos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

    useEffect(() => {
        let coverUrl = '';

        if (book.coverFileId) {
            coverUrl = `/api/utils/cover-image?fileId=${encodeURIComponent(book.coverFileId)}`;
        } else if (book.coverImage) {
            coverUrl = book.coverImage;
        }

        if (coverUrl) {
            const loader = new THREE.TextureLoader();
            loader.load(
                coverUrl,
                (tex) => {
                    tex.colorSpace = THREE.SRGBColorSpace;
                    tex.needsUpdate = true;
                    setTexture(tex);
                },
                undefined,
                () => {
                    setTexture(createFallbackTexture(book.title, book.author));
                }
            );
        }
    }, [book]);

    const getCanvasNDCPointer = (event: PointerEvent) => {
        const rect = gl.domElement.getBoundingClientRect();
        const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        return { x, y };
    };

    const handlePointerDown = (e: THREE.Event) => {
        e.stopPropagation();
        const event = e.nativeEvent as PointerEvent;

        pointerStartPos.current = { x: event.clientX, y: event.clientY };
        setIsDragging(true);
        onDragStateChange(true);

        if (meshRef.current) {
            const cameraDirection = new THREE.Vector3();
            camera.getWorldDirection(cameraDirection);
            dragPlane.current.setFromNormalAndCoplanarPoint(
                cameraDirection.negate(),
                meshRef.current.position
            );
        }
    };

    const handlePointerMove = (e: THREE.Event) => {
        if (!isDragging || !meshRef.current) return;
        e.stopPropagation();

        const event = e.nativeEvent as PointerEvent;
        const ndc = getCanvasNDCPointer(event);

        raycaster.setFromCamera(ndc, camera);
        if (raycaster.ray.intersectPlane(dragPlane.current, planeIntersect.current)) {
            meshRef.current.position.copy(planeIntersect.current);
        }
    };

    const handlePointerUp = (e: THREE.Event) => {
        if (isDragging) {
            e.stopPropagation();
            const event = e.nativeEvent as PointerEvent;
            const dist = Math.hypot(
                event.clientX - pointerStartPos.current.x,
                event.clientY - pointerStartPos.current.y
            );

            setIsDragging(false);
            onDragStateChange(false);

            if (dist < 5) {
                onBookClick(book);
            }
        }
    };

    const isActive = isDragging || hovered;

    return (
        <mesh
            ref={meshRef}
            position={initialPosition}
            rotation={initialRotation}
            renderOrder={isActive ? 999 : 0}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerOver={(e) => {
                e.stopPropagation();
                setHovered(true);
                document.body.style.cursor = 'grab';
            }}
            onPointerOut={() => {
                setHovered(false);
                document.body.style.cursor = 'auto';
            }}
            scale={hovered ? 1.12 : 1.0}
        >
            <boxGeometry args={[7.5, 10.5, 0.6]} />

            <meshStandardMaterial attach="material-0" color="#f1f5f9" depthTest={!isActive} />
            <meshStandardMaterial attach="material-1" color="#1e1b4b" depthTest={!isActive} />
            <meshStandardMaterial attach="material-2" color="#f1f5f9" depthTest={!isActive} />
            <meshStandardMaterial attach="material-3" color="#f1f5f9" depthTest={!isActive} />
            <meshStandardMaterial attach="material-4" map={texture} roughness={0.2} depthTest={!isActive} />
            <meshStandardMaterial attach="material-5" map={texture} roughness={0.4} depthTest={!isActive} />
        </mesh>
    );
}

export default function BookCloud3D({ books = [], onBookClick, onClose }: BookCloud3DProps) {
    const [controlsEnabled, setControlsEnabled] = useState(true);

    const bookTransformations = useMemo(() => {
        const list = Array.isArray(books) ? books : [];
        const count = list.length;
        if (count === 0) return [];

        // Uniform ring placement for small counts (1 to 5 books)
        if (count < 6) {
            const radius = count === 1 ? 0 : 18;
            return list.map((book, i) => {
                const angle = (i / count) * Math.PI * 2;
                const posX = radius * Math.cos(angle);
                const posY = radius * Math.sin(angle);

                return {
                    book,
                    position: [posX, posY, 0] as [number, number, number],
                    rotation: [0, 0, 0] as [number, number, number],
                };
            });
        }

        // Spherical distribution for 6+ books with a minimum radius floor
        const densityRadius = Math.max(24, 18 + Math.sqrt(count) * 6.0);

        return list.map((book, i) => {
            const u = 0.35 + 0.65 * (Math.sin(i * 12.9898 + 78.233) * 0.5 + 0.5);
            const v = Math.cos(i * 4.1414 + 12.121) * 0.5 + 0.5;
            const w = Math.sin(i * 9.3232 + 45.454) * 0.5 + 0.5;

            const r = Math.cbrt(u) * densityRadius;
            const theta = v * 2 * Math.PI;
            const phi = Math.acos(2 * w - 1);

            const posX = r * Math.sin(phi) * Math.cos(theta);
            const posY = r * Math.sin(phi) * Math.sin(theta);
            const posZ = r * Math.cos(phi);

            const rotX = Math.sin(i * 7) * 0.35;
            const rotY = Math.cos(i * 13) * 0.45;
            const rotZ = Math.sin(i * 21) * 0.25;

            return {
                book,
                position: [posX, posY, posZ] as [number, number, number],
                rotation: [rotX, rotY, rotZ] as [number, number, number],
            };
        });
    }, [books]);

    return (
        <div className="fixed inset-0 z-40 w-screen h-screen pointer-events-none select-none bg-black-950/40 backdrop-blur-[1px]">
            {onClose && (
                <button
                    onClick={onClose}
                    aria-label="Close 3D View"
                    className="fixed top-5 right-6 z-50 p-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-full shadow-2xl border border-slate-700 transition-all cursor-pointer pointer-events-auto"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            )}

            <Canvas
                camera={{ position: [0, 0, 120], fov: 60 }}
                gl={{ alpha: true, antialias: true }}
                style={{ background: 'transparent', pointerEvents: 'auto' }}
                className="w-full h-full"
            >
                <ambientLight intensity={1.8} />
                <directionalLight position={[20, 30, 20]} intensity={2.2} />
                <pointLight position={[-20, -20, -10]} intensity={1.0} />

                <OrbitControls
                    enabled={controlsEnabled}
                    enableZoom={true}
                    enableRotate={true}
                    enablePan={true}
                    rotateSpeed={0.7}
                    zoomSpeed={1.0}
                />

                {bookTransformations.map(({ book, position, rotation }) => (
                    <DraggableMeshBook
                        key={book.id}
                        book={book}
                        initialPosition={position}
                        initialRotation={rotation}
                        onBookClick={onBookClick}
                        onDragStateChange={(dragging) => setControlsEnabled(!dragging)}
                    />
                ))}
            </Canvas>
        </div>
    );
}