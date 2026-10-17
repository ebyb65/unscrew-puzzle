/**
 * ============================================================================
 * UNSCREW FRENZY 3D - THREE.JS ENGINE
 * 360° Rotatable Turntable Cottage + Raycasting + Web Audio Synthesizer
 * ============================================================================
 */

(function () {
    const Sound = {
        ctx: null,
        init() {
            if (!this.ctx) {
                const AudioCtx = window.AudioContext || window.webkitAudioContext;
                if (AudioCtx) this.ctx = new AudioCtx();
            }
            if (this.ctx && this.ctx.state === 'suspended') {
                this.ctx.resume();
            }
        },
        playRatchet() {
            this.init();
            if (!this.ctx) return;
            const now = this.ctx.currentTime;
            for (let i = 0; i < 4; i++) {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.connect(gain);
                gain.connect(this.ctx.destination);
                osc.type = 'triangle';
                const t = now + i * 0.035;
                osc.frequency.setValueAtTime(450 + i * 90, t);
                gain.gain.setValueAtTime(0.25, t);
                gain.gain.exponentialRampToValueAtTime(0.01, t + 0.03);
                osc.start(t);
                osc.stop(t + 0.03);
            }
        },
        playPop() {
            this.init();
            if (!this.ctx) return;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.type = 'sine';
            const now = this.ctx.currentTime;
            osc.frequency.setValueAtTime(600, now);
            osc.frequency.exponentialRampToValueAtTime(1200, now + 0.1);
            gain.gain.setValueAtTime(0.2, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
            osc.start(now);
            osc.stop(now + 0.1);
        },
        playBoxComplete() {
            this.init();
            if (!this.ctx) return;
            const notes = [523.25, 659.25, 783.99, 1046.5];
            notes.forEach((freq, idx) => {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.connect(gain);
                gain.connect(this.ctx.destination);
                osc.type = 'triangle';
                const t = this.ctx.currentTime + idx * 0.07;
                osc.frequency.setValueAtTime(freq, t);
                gain.gain.setValueAtTime(0.25, t);
                gain.gain.exponentialRampToValueAtTime(0.01, t + 0.2);
                osc.start(t);
                osc.stop(t + 0.2);
            });
        },
        playWinFanfare() {
            this.init();
            if (!this.ctx) return;
            const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
            notes.forEach((freq, idx) => {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.connect(gain);
                gain.connect(this.ctx.destination);
                osc.type = 'sine';
                const t = this.ctx.currentTime + idx * 0.1;
                osc.frequency.setValueAtTime(freq, t);
                gain.gain.setValueAtTime(0.3, t);
                gain.gain.exponentialRampToValueAtTime(0.01, t + 0.35);
                osc.start(t);
                osc.stop(t + 0.35);
            });
        }
    };

    const LEVEL_CONFIG = {
        initialActiveBoxes: 2,
        maxActiveBoxes: 4,
        initialBackupHoles: 5,
        maxBackupHoles: 7,
        boxQueue: ['#EF4444', '#3B82F6', '#10B981', '#F59E0B'],
        screws: [
            // FRONT (Red #EF4444)
            { id: 's_r1', color: '#EF4444', x: -0.65, y: 0.3, z: 1.05, nx: 0, ny: 0, nz: 1 },
            { id: 's_r2', color: '#EF4444', x: 0.65,  y: 0.3, z: 1.05, nx: 0, ny: 0, nz: 1 },
            { id: 's_r3', color: '#EF4444', x: 0.0,   y: -0.4, z: 1.05, nx: 0, ny: 0, nz: 1 },

            // LEFT (Blue #3B82F6)
            { id: 's_b1', color: '#3B82F6', x: -1.05, y: 0.3, z: -0.5, nx: -1, ny: 0, nz: 0 },
            { id: 's_b2', color: '#3B82F6', x: -1.05, y: 0.3, z: 0.5,  nx: -1, ny: 0, nz: 0 },
            { id: 's_b3', color: '#3B82F6', x: -0.85, y: 1.25, z: 0.0, nx: -0.7, ny: 0.7, nz: 0 },

            // RIGHT (Green #10B981)
            { id: 's_g1', color: '#10B981', x: 1.05, y: 0.3, z: -0.5, nx: 1, ny: 0, nz: 0 },
            { id: 's_g2', color: '#10B981', x: 1.05, y: 0.3, z: 0.5,  nx: 1, ny: 0, nz: 0 },
            { id: 's_g3', color: '#10B981', x: 0.85, y: 1.25, z: 0.0, nx: 0.7, ny: 0.7, nz: 0 },

            // BACK (Yellow #F59E0B)
            { id: 's_y1', color: '#F59E0B', x: -0.6, y: 0.3, z: -1.05, nx: 0, ny: 0, nz: -1 },
            { id: 's_y2', color: '#F59E0B', x: 0.6,  y: 0.3, z: -1.05, nx: 0, ny: 0, nz: -1 },
            { id: 's_y3', color: '#F59E0B', x: 0.45, y: 1.75, z: -0.4, nx: 0, ny: 0, nz: -1 }
        ]
    };

    class StateMachine {
        constructor(config) {
            this.config = config;
            this.activeBoxes = [];
            this.boxQueue = [...config.boxQueue];
            this.backupHoles = [];
            this.screws = new Map();
            this.isGameOver = false;

            for (let i = 0; i < config.maxBackupHoles; i++) {
                this.backupHoles.push({
                    index: i,
                    isUnlocked: i < config.initialBackupHoles,
                    screwId: null,
                    color: null
                });
            }

            for (const s of config.screws) {
                this.screws.set(s.id, { ...s, location: 'MODEL', isRemoved: false });
            }

            while (this.activeBoxes.length < config.initialActiveBoxes && this.boxQueue.length > 0) {
                const color = this.boxQueue.shift();
                this.activeBoxes.push({
                    id: 'b_' + Math.random().toString(36).substr(2, 5),
                    color: color.toUpperCase(),
                    capacity: 3,
                    screws: []
                });
            }
        }

        tapScrew(screwId) {
            if (this.isGameOver) return null;
            const screw = this.screws.get(screwId);
            if (!screw || screw.isRemoved) return null;

            const c = screw.color.toUpperCase();
            const targetBoxIdx = this.activeBoxes.findIndex(b => b.color === c && b.screws.length < 3);

            if (targetBoxIdx !== -1) {
                const box = this.activeBoxes[targetBoxIdx];
                screw.isRemoved = true;
                screw.location = 'BOX';
                box.screws.push(screwId);
                return {
                    action: 'TO_BOX',
                    screwId,
                    color: screw.color,
                    boxIndex: targetBoxIdx,
                    boxCount: box.screws.length,
                    boxCompleted: box.screws.length === 3
                };
            }

            const emptyHoleIdx = this.backupHoles.findIndex(h => h.isUnlocked && h.screwId === null);
            if (emptyHoleIdx !== -1) {
                const hole = this.backupHoles[emptyHoleIdx];
                screw.isRemoved = true;
                screw.location = 'BACKUP';
                hole.screwId = screwId;
                hole.color = c;
                return { action: 'TO_BACKUP', screwId, color: screw.color, holeIndex: emptyHoleIdx };
            }

            return { action: 'BLOCKED' };
        }

        onBoxCompleted(boxIndex) {
            this.activeBoxes.splice(boxIndex, 1);
            let newBox = null;
            if (this.boxQueue.length > 0) {
                const nextColor = this.boxQueue.shift().toUpperCase();
                newBox = {
                    id: 'b_' + Math.random().toString(36).substr(2, 5),
                    color: nextColor,
                    capacity: 3,
                    screws: []
                };
                this.activeBoxes.splice(boxIndex, 0, newBox);
            }

            const pulled = [];
            if (newBox) {
                for (let i = 0; i < this.backupHoles.length; i++) {
                    const hole = this.backupHoles[i];
                    if (hole.isUnlocked && hole.screwId && hole.color === newBox.color && newBox.screws.length < 3) {
                        const sId = hole.screwId;
                        const s = this.screws.get(sId);
                        s.location = 'BOX';
                        newBox.screws.push(sId);
                        hole.screwId = null;
                        hole.color = null;
                        pulled.push({ screwId: sId, color: s.color, holeIndex: i });
                    }
                }
            }
            return { newBox, boxIndex, pulled };
        }

        checkWin() {
            let left = 0;
            for (const s of this.screws.values()) {
                if (s.location === 'MODEL' || s.location === 'BACKUP') left++;
            }
            return left === 0;
        }

        checkLoss() {
            const isBackupFull = this.backupHoles.filter(h => h.isUnlocked).every(h => h.screwId !== null);
            if (!isBackupFull) return false;

            const openColors = new Set(this.activeBoxes.filter(b => b.screws.length < 3).map(b => b.color));
            for (const s of this.screws.values()) {
                if (!s.isRemoved && openColors.has(s.color.toUpperCase())) return false;
            }
            return true;
        }
    }

    let scene, camera, renderer, modelGroup;
    let screwMeshMap = new Map();
    let stateMachine, raycaster, mouse;

    let isDragging = false;
    let previousPointerX = 0;
    let targetRotationY = 0;
    let currentRotationY = 0;
    let pointerDownStartPos = { x: 0, y: 0 };

    function init3DGame() {
        const container = document.getElementById('canvas-container');
        const width = window.innerWidth;
        const height = window.innerHeight;

        scene = new THREE.Scene();

        camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
        camera.position.set(0, 3.2, 5.5);
        camera.lookAt(0, 0.2, 0);

        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(width, height);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        container.appendChild(renderer.domElement);

        raycaster = new THREE.Raycaster();
        mouse = new THREE.Vector2();

        scene.add(new THREE.AmbientLight(0xffffff, 0.75));

        const dirLight = new THREE.DirectionalLight(0xfffbeb, 0.85);
        dirLight.position.set(5, 10, 7);
        dirLight.castShadow = true;
        scene.add(dirLight);

        const rimLight = new THREE.DirectionalLight(0xdbeafe, 0.4);
        rimLight.position.set(-5, 4, -5);
        scene.add(rimLight);

        stateMachine = new StateMachine(LEVEL_CONFIG);

        buildToyCottageModel();
        renderUIBoxes();
        renderUIBackupTray();
        setupInteractionListeners();

        window.addEventListener('resize', onWindowResize);
        animate();
    }

    function buildToyCottageModel() {
        modelGroup = new THREE.Group();
        scene.add(modelGroup);

        // Pedestal
        const pedestal = new THREE.Mesh(
            new THREE.CylinderGeometry(2.3, 2.4, 0.25, 40),
            new THREE.MeshStandardMaterial({ color: 0x86efac, roughness: 0.5 })
        );
        pedestal.position.y = -0.9;
        pedestal.receiveShadow = true;
        modelGroup.add(pedestal);

        // Cottage Body
        const body = new THREE.Mesh(
            new THREE.BoxGeometry(2.0, 1.5, 2.0),
            new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.4 })
        );
        body.position.y = 0.0;
        body.castShadow = true;
        body.receiveShadow = true;
        modelGroup.add(body);

        // Roof
        const roof = new THREE.Mesh(
            new THREE.ConeGeometry(1.8, 1.2, 4),
            new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.35 })
        );
        roof.position.y = 1.35;
        roof.rotation.y = Math.PI / 4;
        roof.scale.set(1.1, 1.0, 1.1);
        roof.castShadow = true;
        modelGroup.add(roof);

        // Chimney
        const chimney = new THREE.Mesh(
            new THREE.BoxGeometry(0.35, 0.8, 0.35),
            new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.6 })
        );
        chimney.position.set(0.45, 1.7, -0.4);
        chimney.castShadow = true;
        modelGroup.add(chimney);

        // Door
        const door = new THREE.Mesh(
            new THREE.BoxGeometry(0.5, 0.75, 0.06),
            new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.5 })
        );
        door.position.set(0, -0.38, 1.03);
        modelGroup.add(door);

        // Windows
        const windowGeo = new THREE.BoxGeometry(0.45, 0.45, 0.05);
        const windowMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.2 });

        const winF1 = new THREE.Mesh(windowGeo, windowMat); winF1.position.set(-0.65, 0.3, 1.03);
        const winF2 = new THREE.Mesh(windowGeo, windowMat); winF2.position.set(0.65, 0.3, 1.03);
        modelGroup.add(winF1, winF2);

        const winL = new THREE.Mesh(windowGeo, windowMat); winL.position.set(-1.03, 0.3, 0); winL.rotation.y = Math.PI / 2;
        const winR = new THREE.Mesh(windowGeo, windowMat); winR.position.set(1.03, 0.3, 0); winR.rotation.y = Math.PI / 2;
        modelGroup.add(winL, winR);

        const winB1 = new THREE.Mesh(windowGeo, windowMat); winB1.position.set(-0.6, 0.3, -1.03);
        const winB2 = new THREE.Mesh(windowGeo, windowMat); winB2.position.set(0.6, 0.3, -1.03);
        modelGroup.add(winB1, winB2);

        // Screws
        LEVEL_CONFIG.screws.forEach(sData => {
            const screwMesh = create3DScrewMesh(sData.color);
            screwMesh.position.set(sData.x, sData.y, sData.z);
            const normal = new THREE.Vector3(sData.nx, sData.ny, sData.nz).normalize();
            screwMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
            screwMesh.userData = { screwId: sData.id, color: sData.color, normal };
            modelGroup.add(screwMesh);
            screwMeshMap.set(sData.id, screwMesh);
        });
    }

    function create3DScrewMesh(hexColor) {
        const group = new THREE.Group();

        const ring = new THREE.Mesh(
            new THREE.CylinderGeometry(0.18, 0.18, 0.08, 24).rotateX(Math.PI / 2),
            new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.85, roughness: 0.2 })
        );
        ring.castShadow = true;
        group.add(ring);

        const cap = new THREE.Mesh(
            new THREE.CylinderGeometry(0.14, 0.14, 0.09, 24).rotateX(Math.PI / 2),
            new THREE.MeshStandardMaterial({ color: parseInt(hexColor.replace('#', '0x'), 16), metalness: 0.3, roughness: 0.3 })
        );
        group.add(cap);

        const slitMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.8 });
        const slitH = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.035, 0.095), slitMat);
        const slitV = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.16, 0.095), slitMat);
        group.add(slitH, slitV);

        return group;
    }

    function renderUIBoxes() {
        const container = document.getElementById('boxes-container');
        container.innerHTML = '';
        stateMachine.activeBoxes.forEach((box, idx) => {
            const card = document.createElement('div');
            card.className = 'box-card';
            card.id = `box-ui-${idx}`;
            card.style.borderColor = box.color;
            for (let i = 0; i < 3; i++) {
                const socket = document.createElement('div');
                socket.className = 'box-socket';
                if (i < box.screws.length) {
                    socket.classList.add('filled');
                    socket.style.backgroundColor = box.color;
                }
                card.appendChild(socket);
            }
            container.appendChild(card);
        });
    }

    function renderUIBackupTray() {
        const tray = document.getElementById('backup-tray');
        tray.innerHTML = '';
        stateMachine.backupHoles.forEach((hole, idx) => {
            const slot = document.createElement('div');
            slot.className = 'hole-slot';
            slot.id = `hole-ui-${idx}`;
            if (!hole.isUnlocked) {
                slot.classList.add('locked');
            } else if (hole.screwId) {
                const screwElem = document.createElement('div');
                screwElem.className = 'hole-screw';
                screwElem.style.backgroundColor = hole.color;
                slot.appendChild(screwElem);
            }
            tray.appendChild(slot);
        });
    }

    function setupInteractionListeners() {
        const container = document.getElementById('canvas-container');

        const onPointerDown = (e) => {
            isDragging = true;
            const x = e.clientX || (e.touches && e.touches[0].clientX);
            const y = e.clientY || (e.touches && e.touches[0].clientY);
            previousPointerX = x;
            pointerDownStartPos = { x, y };
        };

        const onPointerMove = (e) => {
            if (!isDragging) return;
            const x = e.clientX || (e.touches && e.touches[0].clientX);
            const deltaX = x - previousPointerX;
            previousPointerX = x;
            targetRotationY += deltaX * 0.008;

            const hint = document.getElementById('rotate-hint');
            if (hint) hint.style.opacity = '0';
        };

        const onPointerUp = (e) => {
            if (!isDragging) return;
            isDragging = false;
            const endX = e.clientX || (e.changedTouches && e.changedTouches[0].clientX) || previousPointerX;
            const endY = e.clientY || (e.changedTouches && e.changedTouches[0].clientY) || pointerDownStartPos.y;
            const dist = Math.hypot(endX - pointerDownStartPos.x, endY - pointerDownStartPos.y);

            if (dist < 8) {
                handleTapAt(endX, endY);
            }
        };

        container.addEventListener('mousedown', onPointerDown);
        window.addEventListener('mousemove', onPointerMove);
        window.addEventListener('mouseup', onPointerUp);

        container.addEventListener('touchstart', onPointerDown, { passive: false });
        window.addEventListener('touchmove', onPointerMove, { passive: false });
        window.addEventListener('touchend', onPointerUp);
    }

    function handleTapAt(screenX, screenY) {
        mouse.x = (screenX / window.innerWidth) * 2 - 1;
        mouse.y = -(screenY / window.innerHeight) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);
        const screwMeshes = Array.from(screwMeshMap.values());
        const intersects = raycaster.intersectObjects(screwMeshes, true);

        if (intersects.length > 0) {
            let obj = intersects[0].object;
            while (obj && !obj.userData.screwId && obj.parent) {
                obj = obj.parent;
            }
            if (obj && obj.userData && obj.userData.screwId) {
                onScrewSelected(obj.userData.screwId, obj);
            }
        }
    }

    function onScrewSelected(screwId, mesh) {
        const result = stateMachine.tapScrew(screwId);
        if (!result) return;

        if (result.action === 'TO_BOX') {
            Sound.playRatchet();
            animate3DUnscrew(mesh, () => {
                Sound.playPop();
                renderUIBoxes();
                if (result.boxCompleted) {
                    Sound.playBoxComplete();
                    const boxCard = document.getElementById(`box-ui-${result.boxIndex}`);
                    if (boxCard) {
                        boxCard.style.transform = 'scale(1.15)';
                        setTimeout(() => {
                            boxCard.style.transform = 'scale(0) translateX(-100px)';
                            setTimeout(() => {
                                stateMachine.onBoxCompleted(result.boxIndex);
                                renderUIBoxes();
                                renderUIBackupTray();
                                checkGameEnd();
                            }, 250);
                        }, 200);
                    }
                } else {
                    checkGameEnd();
                }
            });
        } else if (result.action === 'TO_BACKUP') {
            Sound.playRatchet();
            animate3DUnscrew(mesh, () => {
                Sound.playPop();
                renderUIBackupTray();
                checkGameEnd();
            });
        } else if (result.action === 'BLOCKED') {
            new TWEEN.Tween(mesh.position)
                .to({ x: mesh.position.x + 0.05 }, 40)
                .yoyo(true)
                .repeat(3)
                .start();
        }
    }

    function animate3DUnscrew(mesh, onComplete) {
        const normal = mesh.userData.normal;
        const targetOutPos = mesh.position.clone().add(normal.clone().multiplyScalar(0.75));

        new TWEEN.Tween(mesh.position).to(targetOutPos, 220).easing(TWEEN.Easing.Quadratic.Out).start();
        new TWEEN.Tween(mesh.rotation).to({ z: mesh.rotation.z - Math.PI * 4 }, 220).easing(TWEEN.Easing.Quadratic.Out).start();
        new TWEEN.Tween(mesh.scale).to({ x: 0.1, y: 0.1, z: 0.1 }, 240).easing(TWEEN.Easing.Cubic.In).onComplete(() => {
            mesh.visible = false;
            if (onComplete) onComplete();
        }).start();
    }

    function checkGameEnd() {
        if (stateMachine.checkWin()) {
            Sound.playWinFanfare();
            showModal(true);
        } else if (stateMachine.checkLoss()) {
            showModal(false);
        }
    }

    function showModal(isWin) {
        const modal = document.getElementById('modal-overlay');
        const icon = document.getElementById('modal-icon');
        const title = document.getElementById('modal-title');
        const desc = document.getElementById('modal-desc');
        const btn = document.getElementById('modal-btn');

        if (isWin) {
            icon.innerText = '⭐ ⭐ ⭐';
            title.innerText = 'STAGE CLEARED!';
            title.style.color = '#10b981';
            desc.innerText = 'You successfully unscrewed the entire 3D cottage!';
            btn.innerText = 'PLAY AGAIN';
            btn.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
        } else {
            icon.innerText = '💥';
            title.innerText = 'OUT OF SLOTS!';
            title.style.color = '#ef4444';
            desc.innerText = 'Backup tray is full and no visible screws match active boxes.';
            btn.innerText = 'TRY AGAIN';
            btn.style.background = 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)';
        }
        modal.classList.add('active');
    }

    function onWindowResize() {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    }

    function animate(time) {
        requestAnimationFrame(animate);
        currentRotationY += (targetRotationY - currentRotationY) * 0.1;
        if (modelGroup) {
            modelGroup.rotation.y = currentRotationY;
        }
        TWEEN.update(time);
        renderer.render(scene, camera);
    }

    window.addEventListener('DOMContentLoaded', init3DGame);
})();
