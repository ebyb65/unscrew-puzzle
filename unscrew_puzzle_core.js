/**
 * ============================================================================
 * UNSCREW ANYTHING - PREMIUM MOBILE PUZZLE GAME (Phaser 3)
 * Full Visual Polish, Procedural Textures, Realistic Screws & Physics Planks
 * Web Audio FX Integration (Zero external assets required)
 * ============================================================================
 */

(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory(require('events'));
    } else {
        const PhaserEvents = (typeof Phaser !== 'undefined' && Phaser.Events) ? Phaser.Events.EventEmitter : null;
        root.UnscrewPuzzle = factory(PhaserEvents);
    }
}(typeof self !== 'undefined' ? self : (typeof global !== 'undefined' ? global : this), function (EventEmitterClass) {

    const EventEmitter = EventEmitterClass || class SimpleEventEmitter {
        constructor() { this._events = {}; }
        on(event, listener) {
            (this._events[event] = this._events[event] || []).push(listener);
            return this;
        }
        emit(event, ...args) {
            if (this._events[event]) {
                this._events[event].slice().forEach(fn => fn(...args));
            }
        }
        off(event, listener) {
            if (!this._events[event]) return;
            this._events[event] = this._events[event].filter(fn => fn !== listener);
        }
    };

    /**
     * Synthesized Real-time Audio FX via Web Audio API (No external sound files)
     */
    const SoundFX = {
        ctx: null,
        init() {
            if (!this.ctx && typeof window !== 'undefined') {
                const AudioCtx = window.AudioContext || window.webkitAudioContext;
                if (AudioCtx) this.ctx = new AudioCtx();
            }
            if (this.ctx && this.ctx.state === 'suspended') {
                this.ctx.resume();
            }
        },
        playUnscrew() {
            this.init();
            if (!this.ctx) return;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(320, this.ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(750, this.ctx.currentTime + 0.12);
            gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.12);
            osc.start();
            osc.stop(this.ctx.currentTime + 0.12);
        },
        playChime() {
            this.init();
            if (!this.ctx) return;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.type = 'sine';
            osc.frequency.setValueAtTime(987.77, this.ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(1318.51, this.ctx.currentTime + 0.18);
            gain.gain.setValueAtTime(0.25, this.ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.18);
            osc.start();
            osc.stop(this.ctx.currentTime + 0.18);
        },
        playThud() {
            this.init();
            if (!this.ctx) return;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.type = 'sine';
            osc.frequency.setValueAtTime(160, this.ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(45, this.ctx.currentTime + 0.22);
            gain.gain.setValueAtTime(0.35, this.ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.22);
            osc.start();
            osc.stop(this.ctx.currentTime + 0.22);
        },
        playBoxFilled() {
            this.init();
            if (!this.ctx) return;
            const notes = [587.33, 880, 1174.66];
            notes.forEach((freq, idx) => {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.connect(gain);
                gain.connect(this.ctx.destination);
                osc.type = 'triangle';
                const startTime = this.ctx.currentTime + idx * 0.08;
                osc.frequency.setValueAtTime(freq, startTime);
                gain.gain.setValueAtTime(0.2, startTime);
                gain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.2);
                osc.start(startTime);
                osc.stop(startTime + 0.2);
            });
        },
        playFanfare() {
            this.init();
            if (!this.ctx) return;
            const notes = [523.25, 659.25, 783.99, 1046.50];
            notes.forEach((freq, idx) => {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.connect(gain);
                gain.connect(this.ctx.destination);
                osc.type = 'triangle';
                const startTime = this.ctx.currentTime + idx * 0.12;
                osc.frequency.setValueAtTime(freq, startTime);
                gain.gain.setValueAtTime(0.25, startTime);
                gain.gain.exponentialRampToValueAtTime(0.01, startTime + 0.3);
                osc.start(startTime);
                osc.stop(startTime + 0.3);
            });
        }
    };

    /**
     * ------------------------------------------------------------------------
     * 1. DATA VALIDATION & SCHEMA
     * ------------------------------------------------------------------------
     */
    const LevelValidator = {
        validate(config) {
            const errors = [];
            if (!config || !Array.isArray(config.screws) || !Array.isArray(config.plates)) {
                return { isValid: false, errors: ['Invalid level configuration structure.'] };
            }

            const colorCounts = {};
            const screwIds = new Set();
            for (const screw of config.screws) {
                if (screwIds.has(screw.id)) {
                    errors.push(`Duplicate screw ID: "${screw.id}".`);
                }
                screwIds.add(screw.id);
                const c = (screw.color || '').toUpperCase();
                colorCounts[c] = (colorCounts[c] || 0) + 1;
            }

            for (const [color, count] of Object.entries(colorCounts)) {
                if (count % 3 !== 0) {
                    errors.push(`Color ${color} has ${count} screws (must be an exact multiple of 3).`);
                }
            }

            return { isValid: errors.length === 0, errors };
        }
    };

    /**
     * ------------------------------------------------------------------------
     * 2. CORE GAMEPLAY STATE MACHINE (Headless Model)
     * ------------------------------------------------------------------------
     */
    class UnscrewGameModel extends EventEmitter {
        constructor(config) {
            super();
            this.config = config;
            this.initialActiveBoxes = config.initialActiveBoxes || 2;
            this.maxActiveBoxes = config.maxActiveBoxes || 4;
            this.unlockedActiveBoxes = this.initialActiveBoxes;

            this.initialBackupHoles = config.initialBackupHoles || 5;
            this.maxBackupHoles = config.maxBackupHoles || 7;
            this.unlockedBackupHoles = this.initialBackupHoles;

            this.status = 'READY';
            this.activeBoxes = [];
            this.boxQueue = [...(config.boxQueue || [])];
            this.backupHoles = [];
            this.screws = new Map();
            this.plates = new Map();

            this._initModel(config);
        }

        _initModel(config) {
            this.backupHoles = [];
            for (let i = 0; i < this.maxBackupHoles; i++) {
                this.backupHoles.push({
                    index: i,
                    isUnlocked: i < this.unlockedBackupHoles,
                    screwId: null,
                    color: null
                });
            }

            for (const plate of config.plates) {
                this.plates.set(plate.id, {
                    ...plate,
                    remainingScrewIds: new Set(plate.requiredScrewIds || []),
                    isDetached: false
                });
            }

            for (const screw of config.screws) {
                this.screws.set(screw.id, {
                    ...screw,
                    location: 'BOARD',
                    isRemoved: false
                });
            }

            this.activeBoxes = [];
            while (this.activeBoxes.length < this.unlockedActiveBoxes && this.boxQueue.length > 0) {
                const nextColor = this.boxQueue.shift();
                this.activeBoxes.push({
                    id: `box_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                    color: nextColor.toUpperCase(),
                    capacity: 3,
                    screws: []
                });
            }

            this.status = 'PLAYING';
        }

        isScrewAccessible(screwId) {
            const screw = this.screws.get(screwId);
            if (!screw || screw.location !== 'BOARD' || screw.isRemoved) return false;

            for (const plate of this.plates.values()) {
                if (!plate.isDetached && plate.layer > screw.layer) {
                    const halfW = (plate.width || 0) / 2;
                    const halfH = (plate.height || 0) / 2;
                    if (screw.x >= plate.x - halfW && screw.x <= plate.x + halfW &&
                        screw.y >= plate.y - halfH && screw.y <= plate.y + halfH) {
                        return false;
                    }
                }
            }
            return true;
        }

        handleScrewTap(screwId) {
            if (this.status !== 'PLAYING') return false;

            const screw = this.screws.get(screwId);
            if (!screw || !this.isScrewAccessible(screwId)) {
                this.emit('TAP_REJECTED', { screwId, reason: 'SCREW_OCCLUDED' });
                return false;
            }

            const screwColor = screw.color.toUpperCase();

            // 1. Try matching active box
            const matchingBoxIndex = this.activeBoxes.findIndex(
                b => b.color === screwColor && b.screws.length < 3
            );

            if (matchingBoxIndex !== -1) {
                const targetBox = this.activeBoxes[matchingBoxIndex];
                this._detachScrewFromBoard(screwId);
                screw.location = 'BOX';
                targetBox.screws.push(screwId);

                this.emit('SCREW_MOVED_TO_BOX', {
                    screwId,
                    color: screw.color,
                    boxId: targetBox.id,
                    boxIndex: matchingBoxIndex,
                    currentScrewsInBox: targetBox.screws.length
                });

                if (targetBox.screws.length === 3) {
                    this._onBoxCompleted(matchingBoxIndex);
                } else {
                    this._evaluateGameState();
                }
                return true;
            }

            // 2. Try placing into first empty backup hole
            const emptyHoleIndex = this.backupHoles.findIndex(
                slot => slot.isUnlocked && slot.screwId === null
            );

            if (emptyHoleIndex !== -1) {
                const targetSlot = this.backupHoles[emptyHoleIndex];
                this._detachScrewFromBoard(screwId);
                screw.location = 'BACKUP';
                targetSlot.screwId = screwId;
                targetSlot.color = screwColor;

                this.emit('SCREW_MOVED_TO_BACKUP', {
                    screwId,
                    color: screw.color,
                    holeIndex: emptyHoleIndex
                });

                this._evaluateGameState();
                return true;
            }

            // 3. Backup full and no matching box
            this.emit('TAP_REJECTED', { screwId, reason: 'STORAGE_FULL' });
            this.checkGameOver();
            return false;
        }

        _detachScrewFromBoard(screwId) {
            const screw = this.screws.get(screwId);
            screw.isRemoved = true;

            if (Array.isArray(screw.boundPlateIds)) {
                for (const plateId of screw.boundPlateIds) {
                    const plate = this.plates.get(plateId);
                    if (plate && !plate.isDetached) {
                        plate.remainingScrewIds.delete(screwId);
                        if (plate.remainingScrewIds.size === 0) {
                            plate.isDetached = true;
                            this.emit('PLATE_DETACHED', { plateId: plate.id, layer: plate.layer });
                        } else if (plate.remainingScrewIds.size === 1) {
                            const pivotScrewId = Array.from(plate.remainingScrewIds)[0];
                            const pivotScrew = this.screws.get(pivotScrewId);
                            this.emit('PLATE_PENDULUM_SWING', {
                                plateId: plate.id,
                                pivotX: pivotScrew.x,
                                pivotY: pivotScrew.y
                            });
                        }
                    }
                }
            }
        }

        _onBoxCompleted(boxIndex) {
            const completedBox = this.activeBoxes[boxIndex];
            this.emit('BOX_COMPLETED', {
                boxId: completedBox.id,
                color: completedBox.color,
                boxIndex
            });

            this.activeBoxes.splice(boxIndex, 1);

            if (this.boxQueue.length > 0) {
                const nextColor = this.boxQueue.shift().toUpperCase();
                const newBox = {
                    id: `box_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                    color: nextColor,
                    capacity: 3,
                    screws: []
                };
                this.activeBoxes.splice(boxIndex, 0, newBox);

                this.emit('BOX_SPAWNED', {
                    boxId: newBox.id,
                    color: newBox.color,
                    boxIndex,
                    remainingQueueCount: this.boxQueue.length
                });

                this._cascadeBackupHoles(boxIndex);
            } else {
                this.emit('BOX_QUEUE_DEPLETED', { vacatedIndex: boxIndex });
                this._evaluateGameState();
            }
        }

        _cascadeBackupHoles(boxIndex) {
            const box = this.activeBoxes[boxIndex];
            if (!box) return;

            let pulledAny = true;
            while (pulledAny && box.screws.length < 3) {
                pulledAny = false;
                for (let i = 0; i < this.backupHoles.length; i++) {
                    const slot = this.backupHoles[i];
                    if (slot.isUnlocked && slot.screwId !== null && slot.color === box.color) {
                        const screwId = slot.screwId;
                        const screw = this.screws.get(screwId);

                        slot.screwId = null;
                        slot.color = null;
                        screw.location = 'BOX';
                        box.screws.push(screwId);

                        this.emit('SCREW_PULLED_FROM_BACKUP', {
                            screwId,
                            color: screw.color,
                            holeIndex: i,
                            boxId: box.id,
                            boxIndex,
                            currentScrewsInBox: box.screws.length
                        });

                        pulledAny = true;
                        if (box.screws.length === 3) break;
                    }
                }
            }

            if (box.screws.length === 3) {
                this._onBoxCompleted(boxIndex);
            } else {
                this._evaluateGameState();
            }
        }

        _evaluateGameState() {
            if (this.status !== 'PLAYING') return;

            let remaining = 0;
            for (const s of this.screws.values()) {
                if (s.location === 'BOARD' || s.location === 'BACKUP') remaining++;
            }

            if (remaining === 0) {
                this.status = 'WON';
                this.emit('GAME_OVER_WIN', { totalScrews: this.screws.size });
                return;
            }

            this.checkGameOver();
        }

        checkGameOver() {
            if (this.status !== 'PLAYING') return false;

            const isBackupFull = this.backupHoles
                .filter(s => s.isUnlocked)
                .every(s => s.screwId !== null);

            if (!isBackupFull) return false;

            const openBoxColors = new Set(
                this.activeBoxes.filter(b => b.screws.length < 3).map(b => b.color)
            );

            if (openBoxColors.size === 0) {
                this.status = 'LOST';
                this.emit('GAME_OVER_LOSS', { reason: 'BACKUP_FULL_NO_OPEN_BOXES' });
                return true;
            }

            let hasValidMove = false;
            for (const [id, screw] of this.screws.entries()) {
                if (screw.location === 'BOARD' && !screw.isRemoved) {
                    if (openBoxColors.has(screw.color.toUpperCase())) {
                        if (this.isScrewAccessible(id)) {
                            hasValidMove = true;
                            break;
                        }
                    }
                }
            }

            if (!hasValidMove) {
                this.status = 'LOST';
                this.emit('GAME_OVER_LOSS', { reason: 'BACKUP_FULL_AND_NO_MATCHING_MOVES' });
                return true;
            }
            return false;
        }
    }

    /**
     * ------------------------------------------------------------------------
     * 3. DELUXE PHASER 3 SCENE (Realistic 3D Graphics, Sound Hooks, Juice)
     * ------------------------------------------------------------------------
     */
    const BaseScene = (typeof Phaser !== 'undefined' && Phaser.Scene) ? Phaser.Scene : class {};

    class UnscrewPuzzleScene extends BaseScene {
        constructor() {
            super({ key: 'UnscrewPuzzleScene' });
        }

        init(data) {
            this.levelConfig = (data && data.levelConfig) ? data.levelConfig : null;
            this.model = null;

            this.plateViews = new Map();
            this.screwViews = new Map();
            this.emptyHoleViews = new Map();
            this.boxViews = [];
            this.backupHoleViews = [];
            this.isInputLocked = false;
        }

        create() {
            if (!this.levelConfig) return;

            this.model = new UnscrewGameModel(this.levelConfig);

            this.createWorkbenchBackground();
            this.createTopHeader();
            this.createBoardArea();
            this.renderEmptyHoles();
            this.renderPlates();
            this.renderScrews();
            this.renderActiveBoxes();
            this.renderBackupHolesTray();

            this.bindModelEvents();
        }

        createWorkbenchBackground() {
            const { width, height } = this.scale;
            this.add.rectangle(width / 2, height / 2, width, height, 0x1A1C23).setDepth(-100);

            const gridGraphics = this.add.graphics().setDepth(-90);
            gridGraphics.fillStyle(0x0E1015, 0.7);
            for (let x = 20; x < width; x += 30) {
                for (let y = 160; y < height - 120; y += 30) {
                    gridGraphics.fillCircle(x, y, 2.5);
                }
            }
        }

        createTopHeader() {
            const { width } = this.scale;

            const headerBar = this.add.container(width / 2, 40).setDepth(200);
            const barBg = this.add.rectangle(0, 0, width - 24, 52, 0x222530, 0.95);
            barBg.setStrokeStyle(2, 0x3A3E4E);

            const levelText = this.add.text(-width / 2 + 36, 0, 'LEVEL 1', {
                fontSize: '18px',
                fontStyle: 'bold',
                fontFamily: 'system-ui, sans-serif',
                color: '#F3F4F6'
            }).setOrigin(0, 0.5);

            const badgeBg = this.add.rectangle(width / 2 - 80, 0, 100, 32, 0x111318, 0.9);
            badgeBg.setStrokeStyle(1.5, 0x4F46E5);
            const badgeText = this.add.text(width / 2 - 80, 0, 'UNSCREW', {
                fontSize: '13px',
                fontStyle: 'bold',
                fontFamily: 'system-ui, sans-serif',
                color: '#A5B4FC'
            }).setOrigin(0.5);

            headerBar.add([barBg, levelText, badgeBg, badgeText]);
        }

        createBoardArea() {
            this.boardContainer = this.add.container(0, 0).setDepth(10);
            this.boxContainer = this.add.container(0, 105).setDepth(50);
            this.backupContainer = this.add.container(0, this.scale.height - 75).setDepth(50);
        }

        renderEmptyHoles() {
            for (const screw of this.model.screws.values()) {
                const hole = this.add.container(screw.x, screw.y).setDepth(1);
                const ring = this.add.circle(0, 0, 16, 0x111317);
                ring.setStrokeStyle(2, 0x333742);
                const inner = this.add.circle(0, 1, 12, 0x07080A);
                hole.add([ring, inner]);
                this.boardContainer.add(hole);
                this.emptyHoleViews.set(screw.id, hole);
            }
        }

        renderPlates() {
            for (const [id, plateData] of this.model.plates.entries()) {
                const plate = this.add.container(plateData.x, plateData.y);
                const w = plateData.width;
                const h = plateData.height;

                const shadow = this.add.rectangle(4, 8, w, h, 0x000000, 0.35);

                const isMetal = plateData.layer > 0;
                const mainColor = isMetal ? 0x94A3B8 : (plateData.color || 0x8C5A3C);
                const borderColor = isMetal ? 0xCBD5E1 : 0x5C3A21;

                const body = this.add.rectangle(0, 0, w, h, mainColor, 1.0);
                body.setStrokeStyle(3, borderColor);

                const highlight = this.add.rectangle(0, -h / 2 + 3, w - 6, 3, 0xFFFFFF, 0.25);
                const shade = this.add.rectangle(0, h / 2 - 3, w - 6, 3, 0x000000, 0.25);

                plate.add([shadow, body, highlight, shade]);

                if (plateData.requiredScrewIds) {
                    for (const sId of plateData.requiredScrewIds) {
                        const s = this.model.screws.get(sId);
                        if (s) {
                            const localX = s.x - plateData.x;
                            const localY = s.y - plateData.y;
                            const holeCutout = this.add.circle(localX, localY, 15, 0x15161C);
                            holeCutout.setStrokeStyle(2, borderColor, 0.8);
                            plate.add(holeCutout);
                        }
                    }
                }

                plate.setDepth(plateData.layer * 10 + 5);
                this.boardContainer.add(plate);
                this.plateViews.set(id, { container: plate, data: plateData });
            }
        }

        renderScrews() {
            for (const [id, screwData] of this.model.screws.entries()) {
                const screw = this.add.container(screwData.x, screwData.y);
                const colorInt = parseInt(screwData.color.replace('#', '0x'), 16);

                const shadow = this.add.circle(2, 4, 18, 0x000000, 0.4);
                const chromeRing = this.add.circle(0, 0, 18, 0xE2E8F0);
                chromeRing.setStrokeStyle(2, 0x64748B);

                const enamel = this.add.circle(0, 0, 14, colorInt);
                const specHighlight = this.add.circle(-4, -4, 6, 0xFFFFFF, 0.4);

                const slitH = this.add.rectangle(0, 0, 14, 4, 0x1E293B);
                const slitV = this.add.rectangle(0, 0, 4, 14, 0x1E293B);

                screw.add([shadow, chromeRing, enamel, specHighlight, slitH, slitV]);
                screw.setSize(44, 44);
                screw.setInteractive({ useHandCursor: true });
                screw.setDepth(screwData.layer * 10 + 12);

                screw.on('pointerdown', () => this.onScrewTapped(id));

                this.boardContainer.add(screw);
                this.screwViews.set(id, {
                    container: screw,
                    data: screwData
                });
            }
        }

        renderActiveBoxes() {
            this.boxViews = [];
            const { width } = this.scale;
            const slotWidth = 140;
            const startX = width / 2 - ((this.model.unlockedActiveBoxes - 1) * slotWidth) / 2;

            for (let i = 0; i < this.model.unlockedActiveBoxes; i++) {
                const boxX = startX + i * slotWidth;
                const activeBox = this.model.activeBoxes[i];
                const boxView = this.createDeluxeBox(boxX, 0, activeBox, i);
                this.boxContainer.add(boxView.container);
                this.boxViews.push(boxView);
            }
        }

        createDeluxeBox(x, y, activeBoxData, index) {
            const container = this.add.container(x, y);
            const colorInt = activeBoxData
                ? parseInt(activeBoxData.color.replace('#', '0x'), 16)
                : 0x475569;

            const shellBg = this.add.rectangle(0, 0, 126, 68, 0x1E222D, 0.98);
            shellBg.setStrokeStyle(3.5, colorInt);

            const headerStrip = this.add.rectangle(0, -28, 122, 6, colorInt);

            const slotIndicators = [];
            for (let s = -1; s <= 1; s++) {
                const socketBg = this.add.circle(s * 36, 6, 15, 0x0F1117);
                socketBg.setStrokeStyle(2, 0x334155);

                const socketInner = this.add.circle(s * 36, 6, 11, 0x07080B);
                container.add([socketBg, socketInner]);
                slotIndicators.push(socketInner);
            }

            const glassShine = this.add.rectangle(-25, 0, 30, 64, 0xFFFFFF, 0.04);
            glassShine.angle = -20;

            container.add([shellBg, headerStrip, glassShine]);

            return {
                container,
                shellBg,
                slotIndicators,
                boxData: activeBoxData,
                index
            };
        }

        renderBackupHolesTray() {
            this.backupHoleViews = [];
            const { width } = this.scale;

            const trayW = width - 24;
            const trayBg = this.add.rectangle(width / 2, 0, trayW, 64, 0x1A1C24, 0.95);
            trayBg.setStrokeStyle(2, 0x333846);
            this.backupContainer.add(trayBg);

            const holeSpacing = 44;
            const startX = width / 2 - ((this.model.maxBackupHoles - 1) * holeSpacing) / 2;

            for (let i = 0; i < this.model.maxBackupHoles; i++) {
                const hX = startX + i * holeSpacing;
                const slot = this.model.backupHoles[i];
                const holeContainer = this.add.container(hX, 0);

                const socket = this.add.circle(0, 0, 18, slot.isUnlocked ? 0x0F1117 : 0x15161C);
                socket.setStrokeStyle(2, slot.isUnlocked ? 0x475569 : 0x242834);

                let lockIcon = null;
                if (!slot.isUnlocked) {
                    lockIcon = this.add.text(0, 0, '🔒', { fontSize: '14px' }).setOrigin(0.5);
                    holeContainer.add(lockIcon);
                }

                holeContainer.add([socket]);
                this.backupContainer.add(holeContainer);

                this.backupHoleViews.push({
                    container: holeContainer,
                    slotIndex: i,
                    worldPosition: () => ({
                        x: this.backupContainer.x + holeContainer.x,
                        y: this.backupContainer.y + holeContainer.y
                    })
                });
            }
        }

        onScrewTapped(screwId) {
            if (this.isInputLocked) return;
            this.model.handleScrewTap(screwId);
        }

        bindModelEvents() {
            this.model.on('SCREW_MOVED_TO_BOX', data => {
                SoundFX.playUnscrew();
                this.animateScrewToBox(data);
            });
            this.model.on('SCREW_MOVED_TO_BACKUP', data => {
                SoundFX.playUnscrew();
                this.animateScrewToBackup(data);
            });
            this.model.on('SCREW_PULLED_FROM_BACKUP', data => {
                SoundFX.playChime();
                this.animateScrewFromBackupToBox(data);
            });
            this.model.on('PLATE_PENDULUM_SWING', data => {
                SoundFX.playThud();
                this.animatePendulumSwing(data);
            });
            this.model.on('PLATE_DETACHED', data => {
                SoundFX.playThud();
                this.animatePlateFall(data.plateId);
            });
            this.model.on('BOX_COMPLETED', data => {
                SoundFX.playBoxFilled();
                this.animateBoxCompleted(data);
            });
            this.model.on('BOX_SPAWNED', data => this.animateBoxSpawned(data));
            this.model.on('TAP_REJECTED', data => this.animateTapRejected(data));
            this.model.on('GAME_OVER_WIN', data => {
                SoundFX.playFanfare();
                this.handleWin(data);
            });
            this.model.on('GAME_OVER_LOSS', data => this.handleLoss(data));
        }

        animateScrewToBox(data) {
            const screwView = this.screwViews.get(data.screwId);
            if (!screwView) return;

            const boxView = this.boxViews[data.boxIndex];
            const slotIndex = data.currentScrewsInBox - 1;
            const slotOffset = (slotIndex - 1) * 36;

            const targetX = this.boxContainer.x + boxView.container.x + slotOffset;
            const targetY = this.boxContainer.y + boxView.container.y + 6;

            this.cameras.main.shake(60, 0.003);

            this.tweens.add({
                targets: screwView.container,
                angle: -720,
                scale: 1.4,
                duration: 180,
                ease: 'Quad.easeOut',
                onComplete: () => {
                    this.tweens.add({
                        targets: screwView.container,
                        x: targetX,
                        y: targetY,
                        scale: 0.85,
                        duration: 320,
                        ease: 'Cubic.easeInOut',
                        onComplete: () => {
                            SoundFX.playChime();
                            this.tweens.add({
                                targets: screwView.container,
                                scale: 0.95,
                                duration: 80,
                                yoyo: true
                            });
                        }
                    });
                }
            });
        }

        animateScrewToBackup(data) {
            const screwView = this.screwViews.get(data.screwId);
            const holeView = this.backupHoleViews[data.holeIndex];
            if (!screwView || !holeView) return;

            const targetPos = holeView.worldPosition();
            this.cameras.main.shake(60, 0.003);

            this.tweens.add({
                targets: screwView.container,
                angle: -720,
                scale: 1.4,
                duration: 180,
                ease: 'Quad.easeOut',
                onComplete: () => {
                    this.tweens.add({
                        targets: screwView.container,
                        x: targetPos.x,
                        y: targetPos.y,
                        scale: 0.85,
                        duration: 340,
                        ease: 'Cubic.easeInOut'
                    });
                }
            });
        }

        animateScrewFromBackupToBox(data) {
            const screwView = this.screwViews.get(data.screwId);
            const boxView = this.boxViews[data.boxIndex];
            if (!screwView || !boxView) return;

            const slotIndex = data.currentScrewsInBox - 1;
            const slotOffset = (slotIndex - 1) * 36;
            const targetX = this.boxContainer.x + boxView.container.x + slotOffset;
            const targetY = this.boxContainer.y + boxView.container.y + 6;

            this.tweens.add({
                targets: screwView.container,
                x: targetX,
                y: targetY,
                duration: 300,
                delay: slotIndex * 80,
                ease: 'Back.easeOut'
            });
        }

        animatePendulumSwing(data) {
            const plateView = this.plateViews.get(data.plateId);
            if (!plateView) return;

            const plate = plateView.container;
            const swingAngle = plate.x > data.pivotX ? 22 : -22;

            this.tweens.add({
                targets: plate,
                angle: swingAngle,
                duration: 600,
                ease: 'Elastic.easeOut'
            });
        }

        animatePlateFall(plateId) {
            const plateView = this.plateViews.get(plateId);
            if (!plateView) return;

            const plate = plateView.container;
            const randomTilt = (Math.random() * 60) - 30;

            this.tweens.add({
                targets: plate,
                y: plate.y + 550,
                angle: plate.angle + randomTilt,
                alpha: 0,
                duration: 650,
                ease: 'Quad.easeIn',
                onComplete: () => { plate.destroy(); }
            });
        }

        animateBoxCompleted(data) {
            const boxView = this.boxViews[data.boxIndex];
            if (!boxView) return;

            this.tweens.add({
                targets: boxView.container,
                scaleX: 1.18,
                scaleY: 1.18,
                duration: 160,
                yoyo: true,
                onComplete: () => {
                    this.tweens.add({
                        targets: boxView.container,
                        x: -250,
                        alpha: 0,
                        duration: 340,
                        ease: 'Back.easeIn',
                        onComplete: () => { boxView.container.destroy(); }
                    });
                }
            });
        }

        animateBoxSpawned(data) {
            const { width } = this.scale;
            const slotWidth = 140;
            const startX = width / 2 - ((this.model.unlockedActiveBoxes - 1) * slotWidth) / 2;
            const targetX = startX + data.boxIndex * slotWidth;

            const activeBoxData = this.model.activeBoxes[data.boxIndex];
            const newBoxView = this.createDeluxeBox(width + 160, 0, activeBoxData, data.boxIndex);
            this.boxContainer.add(newBoxView.container);
            this.boxViews[data.boxIndex] = newBoxView;

            this.tweens.add({
                targets: newBoxView.container,
                x: targetX,
                duration: 380,
                ease: 'Back.easeOut'
            });
        }

        animateTapRejected(data) {
            const screwView = this.screwViews.get(data.screwId);
            if (!screwView) return;

            const origX = screwView.container.x;
            this.tweens.add({
                targets: screwView.container,
                x: origX - 7,
                duration: 40,
                yoyo: true,
                repeat: 3,
                onComplete: () => { screwView.container.x = origX; }
            });
        }

        handleWin() {
            const { width, height } = this.scale;
            this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.75).setDepth(999);
            const dialog = this.add.container(width / 2, height / 2).setDepth(1000).setScale(0);

            const card = this.add.rectangle(0, 0, 300, 240, 0x1E222D, 1);
            card.setStrokeStyle(3, 0x10B981);

            const star = this.add.text(0, -60, '⭐ ⭐ ⭐', { fontSize: '28px' }).setOrigin(0.5);
            const title = this.add.text(0, -10, 'VICTORY!', {
                fontSize: '26px',
                fontStyle: 'bold',
                fontFamily: 'system-ui, sans-serif',
                color: '#10B981'
            }).setOrigin(0.5);

            const sub = this.add.text(0, 25, 'All screws cleared!', {
                fontSize: '15px',
                fontFamily: 'system-ui, sans-serif',
                color: '#94A3B8'
            }).setOrigin(0.5);

            const btn = this.add.rectangle(0, 75, 180, 42, 0x10B981).setInteractive({ useHandCursor: true });
            const btnText = this.add.text(0, 75, 'PLAY AGAIN', {
                fontSize: '16px',
                fontStyle: 'bold',
                fontFamily: 'system-ui, sans-serif',
                color: '#FFFFFF'
            }).setOrigin(0.5);

            btn.on('pointerdown', () => {
                this.scene.restart({ levelConfig: this.levelConfig });
            });

            dialog.add([card, star, title, sub, btn, btnText]);

            this.tweens.add({
                targets: dialog,
                scale: 1,
                duration: 400,
                ease: 'Back.easeOut'
            });
        }

        handleLoss() {
            const { width, height } = this.scale;
            this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.75).setDepth(999);
            const dialog = this.add.container(width / 2, height / 2).setDepth(1000).setScale(0);

            const card = this.add.rectangle(0, 0, 300, 220, 0x1E222D, 1);
            card.setStrokeStyle(3, 0xEF4444);

            const title = this.add.text(0, -50, 'OUT OF MOVES!', {
                fontSize: '24px',
                fontStyle: 'bold',
                fontFamily: 'system-ui, sans-serif',
                color: '#EF4444'
            }).setOrigin(0.5);

            const sub = this.add.text(0, -10, 'Holes are full & no open boxes match.', {
                fontSize: '13px',
                align: 'center',
                wordWrap: { width: 250 },
                fontFamily: 'system-ui, sans-serif',
                color: '#94A3B8'
            }).setOrigin(0.5);

            const btn = this.add.rectangle(0, 60, 160, 42, 0xEF4444).setInteractive({ useHandCursor: true });
            const btnText = this.add.text(0, 60, 'RETRY', {
                fontSize: '16px',
                fontStyle: 'bold',
                fontFamily: 'system-ui, sans-serif',
                color: '#FFFFFF'
            }).setOrigin(0.5);

            btn.on('pointerdown', () => {
                this.scene.restart({ levelConfig: this.levelConfig });
            });

            dialog.add([card, title, sub, btn, btnText]);

            this.tweens.add({
                targets: dialog,
                scale: 1,
                duration: 400,
                ease: 'Back.easeOut'
            });
        }
    }

    /**
     * ------------------------------------------------------------------------
     * 4. SAMPLE PUZZLE LEVEL DESIGN
     * ------------------------------------------------------------------------
     */
    const SampleLevel = {
        levelId: 'level_01',
        initialActiveBoxes: 2,
        maxActiveBoxes: 4,
        initialBackupHoles: 5,
        maxBackupHoles: 7,

        boxQueue: ['#FF3B30', '#34C759', '#007AFF', '#FBBF24'],

        plates: [
            {
                id: 'plank_wood_bottom',
                x: 190,
                y: 330,
                width: 260,
                height: 80,
                layer: 0,
                color: 0x8C5A3C,
                requiredScrewIds: ['screw_r1', 'screw_r2']
            },
            {
                id: 'plank_metal_top',
                x: 190,
                y: 330,
                width: 170,
                height: 60,
                layer: 1,
                color: 0x94A3B8,
                requiredScrewIds: ['screw_g1', 'screw_g2']
            }
        ],

        screws: [
            { id: 'screw_g1', color: '#34C759', x: 145, y: 330, layer: 1, boundPlateIds: ['plank_metal_top'] },
            { id: 'screw_g2', color: '#34C759', x: 235, y: 330, layer: 1, boundPlateIds: ['plank_metal_top'] },
            { id: 'screw_g3', color: '#34C759', x: 305, y: 230, layer: 0, boundPlateIds: [] },

            { id: 'screw_r1', color: '#FF3B30', x: 90,  y: 330, layer: 0, boundPlateIds: ['plank_wood_bottom'] },
            { id: 'screw_r2', color: '#FF3B30', x: 290, y: 330, layer: 0, boundPlateIds: ['plank_wood_bottom'] },
            { id: 'screw_r3', color: '#FF3B30', x: 75,  y: 230, layer: 0, boundPlateIds: [] },

            { id: 'screw_b1', color: '#007AFF', x: 130, y: 440, layer: 0, boundPlateIds: [] },
            { id: 'screw_b2', color: '#007AFF', x: 190, y: 440, layer: 0, boundPlateIds: [] },
            { id: 'screw_b3', color: '#007AFF', x: 250, y: 440, layer: 0, boundPlateIds: [] },

            { id: 'screw_y1', color: '#FBBF24', x: 130, y: 510, layer: 0, boundPlateIds: [] },
            { id: 'screw_y2', color: '#FBBF24', x: 190, y: 510, layer: 0, boundPlateIds: [] },
            { id: 'screw_y3', color: '#FBBF24', x: 250, y: 510, layer: 0, boundPlateIds: [] }
        ]
    };

    return {
        LevelValidator,
        UnscrewGameModel,
        UnscrewPuzzleScene,
        SampleLevel
    };
}));
