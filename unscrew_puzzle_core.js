/**
 * ============================================================================
 * UNSCREW ANYTHING - CORE GAMEPLAY LOOP & STATE MACHINE
 * Framework: Phaser 3 / JavaScript (ES6+)
 * Architecture: Decoupled Headless State Machine + Reactive Phaser 3 View Layer
 * ============================================================================
 */

(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        // Node / CommonJS
        module.exports = factory(require('events'));
    } else {
        // Browser / Phaser global
        const PhaserEvents = (typeof Phaser !== 'undefined' && Phaser.Events) ? Phaser.Events.EventEmitter : null;
        root.UnscrewPuzzle = factory(PhaserEvents);
    }
}(typeof self !== 'undefined' ? self : (typeof global !== 'undefined' ? global : this), function (EventEmitterClass) {

    // Fallback minimal EventEmitter if running in pure browser without Phaser loaded yet
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
     * ------------------------------------------------------------------------
     * 1. DATA ARCHITECTURE & VALIDATION
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
                    errors.push(`Duplicate screw ID detected: "${screw.id}".`);
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

            const totalScrews = config.screws.length;
            const totalBoxesProvided = (config.boxQueue || []).length;
            const requiredBoxes = totalScrews / 3;

            if (totalBoxesProvided < requiredBoxes) {
                errors.push(`Level requires ${requiredBoxes} boxes for ${totalScrews} screws, but boxQueue only has ${totalBoxesProvided}.`);
            }

            return {
                isValid: errors.length === 0,
                errors
            };
        }
    };

    /**
     * ------------------------------------------------------------------------
     * 2. CORE GAMEPLAY STATE MACHINE (Headless Logic Manager)
     * ------------------------------------------------------------------------
     */
    class UnscrewGameModel extends EventEmitter {
        constructor(config) {
            super();
            const validation = LevelValidator.validate(config);
            if (!validation.isValid) {
                console.warn('[UnscrewGameModel] Level validation warnings:', validation.errors);
            }

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
            if (!screw || screw.location !== 'BOARD' || screw.isRemoved) {
                return false;
            }

            for (const plate of this.plates.values()) {
                if (!plate.isDetached && plate.layer > screw.layer) {
                    if (this._isPointInPlateBounds(screw.x, screw.y, plate)) {
                        return false;
                    }
                }
            }
            return true;
        }

        _isPointInPlateBounds(px, py, plate) {
            const halfW = (plate.width || 0) / 2;
            const halfH = (plate.height || 0) / 2;
            const minX = plate.x - halfW;
            const maxX = plate.x + halfW;
            const minY = plate.y - halfH;
            const maxY = plate.y + halfH;
            return px >= minX && px <= maxX && py >= minY && py <= maxY;
        }

        handleScrewTap(screwId) {
            if (this.status !== 'PLAYING') {
                this.emit('TAP_REJECTED', { screwId, reason: 'GAME_NOT_ACTIVE' });
                return false;
            }

            const screw = this.screws.get(screwId);
            if (!screw) {
                this.emit('TAP_REJECTED', { screwId, reason: 'SCREW_NOT_FOUND' });
                return false;
            }

            if (!this.isScrewAccessible(screwId)) {
                this.emit('TAP_REJECTED', { screwId, reason: 'SCREW_OCCLUDED' });
                return false;
            }

            const screwColor = screw.color.toUpperCase();

            // Match active box
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
                    currentScrewsInBox: targetBox.screws.length,
                    isFromBackup: false
                });

                if (targetBox.screws.length === 3) {
                    this._onBoxCompleted(matchingBoxIndex);
                } else {
                    this._evaluateGameState();
                }
                return true;
            }

            // Put in empty backup hole
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

            // Storage full -> Check game over
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
                            this.emit('PLATE_DETACHED', {
                                plateId: plate.id,
                                layer: plate.layer
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

            let remainingActiveScrews = 0;
            for (const screw of this.screws.values()) {
                if (screw.location === 'BOARD' || screw.location === 'BACKUP') {
                    remainingActiveScrews++;
                }
            }

            if (remainingActiveScrews === 0) {
                this.status = 'WON';
                this.emit('GAME_OVER_WIN', { totalScrews: this.screws.size });
                return;
            }

            this.checkGameOver();
        }

        checkGameOver() {
            if (this.status !== 'PLAYING') return false;

            const unlockedHoles = this.backupHoles.filter(slot => slot.isUnlocked);
            const isBackupFull = unlockedHoles.every(slot => slot.screwId !== null);

            if (!isBackupFull) return false;

            const openActiveBoxColors = new Set(
                this.activeBoxes.filter(b => b.screws.length < 3).map(b => b.color)
            );

            if (openActiveBoxColors.size === 0) {
                this.status = 'LOST';
                this.emit('GAME_OVER_LOSS', { reason: 'BACKUP_FULL_NO_OPEN_BOXES' });
                return true;
            }

            let hasMatchingAccessibleMove = false;
            for (const [id, screw] of this.screws.entries()) {
                if (screw.location === 'BOARD' && !screw.isRemoved) {
                    if (openActiveBoxColors.has(screw.color.toUpperCase())) {
                        if (this.isScrewAccessible(id)) {
                            hasMatchingAccessibleMove = true;
                            break;
                        }
                    }
                }
            }

            if (!hasMatchingAccessibleMove) {
                this.status = 'LOST';
                this.emit('GAME_OVER_LOSS', { reason: 'BACKUP_FULL_AND_NO_MATCHING_MOVES' });
                return true;
            }

            return false;
        }

        expandActiveBoxes() {
            if (this.unlockedActiveBoxes >= this.maxActiveBoxes) return false;
            this.unlockedActiveBoxes++;
            if (this.boxQueue.length > 0) {
                const nextColor = this.boxQueue.shift().toUpperCase();
                const newBoxIndex = this.activeBoxes.length;
                const spawnedBox = {
                    id: `box_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                    color: nextColor,
                    capacity: 3,
                    screws: []
                };
                this.activeBoxes.push(spawnedBox);
                this.emit('ACTIVE_BOXES_EXPANDED', {
                    unlockedCount: this.unlockedActiveBoxes,
                    box: spawnedBox,
                    boxIndex: newBoxIndex
                });
                this._cascadeBackupHoles(newBoxIndex);
            }
            return true;
        }

        expandBackupHoles() {
            if (this.unlockedBackupHoles >= this.maxBackupHoles) return false;
            const newSlotIndex = this.unlockedBackupHoles;
            this.backupHoles[newSlotIndex].isUnlocked = true;
            this.unlockedBackupHoles++;
            this.emit('BACKUP_HOLES_EXPANDED', {
                unlockedCount: this.unlockedBackupHoles,
                newSlotIndex
            });
            this._evaluateGameState();
            return true;
        }
    }

    /**
     * ------------------------------------------------------------------------
     * 3. PHASER 3 GAME SCENE IMPLEMENTATION
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
            this.boxViews = [];
            this.backupHoleViews = [];
            this.isInputLocked = false;
        }

        create() {
            if (!this.levelConfig) return;

            this.model = new UnscrewGameModel(this.levelConfig);
            this.createBoardLayout();
            this.renderPlates();
            this.renderScrews();
            this.renderActiveBoxes();
            this.renderBackupHoles();
            this.bindModelEvents();
        }

        createBoardLayout() {
            const { width, height } = this.scale;
            this.add.rectangle(width / 2, height / 2, width, height, 0x1E1E24).setDepth(-100);
            this.boardContainer = this.add.container(0, 0);
            this.boxContainer = this.add.container(0, 80);
            this.backupContainer = this.add.container(0, height - 90);
        }

        renderPlates() {
            for (const [id, plateData] of this.model.plates.entries()) {
                const plate = this.add.container(plateData.x, plateData.y);
                const rect = this.add.rectangle(
                    0, 0,
                    plateData.width, plateData.height,
                    plateData.color || 0xC2956E,
                    1.0
                );
                rect.setStrokeStyle(3, 0x5C3A21);
                plate.add(rect);
                plate.setDepth(plateData.layer * 10);
                this.boardContainer.add(plate);
                this.plateViews.set(id, { container: plate, data: plateData });
            }
        }

        renderScrews() {
            for (const [id, screwData] of this.model.screws.entries()) {
                const screw = this.add.container(screwData.x, screwData.y);
                const colorInt = parseInt(screwData.color.replace('#', '0x'), 16);

                const outer = this.add.circle(0, 0, 18, colorInt);
                outer.setStrokeStyle(3, 0xFFFFFF, 0.9);

                const slit = this.add.rectangle(0, 0, 18, 4, 0x222222);

                screw.add([outer, slit]);
                screw.setSize(38, 38);
                screw.setInteractive({ useHandCursor: true });
                screw.setDepth(screwData.layer * 10 + 5);

                screw.on('pointerdown', () => this.onScrewTapped(id));

                this.boardContainer.add(screw);
                this.screwViews.set(id, { container: screw, data: screwData, outer, slit });
            }
        }

        renderActiveBoxes() {
            this.boxViews = [];
            const { width } = this.scale;
            const slotWidth = 120;
            const startX = width / 2 - ((this.model.unlockedActiveBoxes - 1) * slotWidth) / 2;

            for (let i = 0; i < this.model.unlockedActiveBoxes; i++) {
                const boxX = startX + i * slotWidth;
                const activeBox = this.model.activeBoxes[i];
                const boxView = this.createBoxView(boxX, 0, activeBox, i);
                this.boxContainer.add(boxView.container);
                this.boxViews.push(boxView);
            }
        }

        createBoxView(x, y, activeBoxData, index) {
            const container = this.add.container(x, y);
            const colorInt = activeBoxData
                ? parseInt(activeBoxData.color.replace('#', '0x'), 16)
                : 0x444444;

            const bg = this.add.rectangle(0, 0, 105, 54, 0x2B2D42, 0.95);
            bg.setStrokeStyle(3, colorInt);

            const slotIndicators = [];
            for (let s = -1; s <= 1; s++) {
                const slotCircle = this.add.circle(s * 30, 0, 11, 0x111118);
                slotCircle.setStrokeStyle(1.5, colorInt, 0.6);
                container.add(slotCircle);
                slotIndicators.push(slotCircle);
            }

            container.add([bg]);
            return { container, bg, slotIndicators, boxData: activeBoxData, index };
        }

        renderBackupHoles() {
            this.backupHoleViews = [];
            const { width } = this.scale;
            const holeSpacing = 50;
            const startX = width / 2 - ((this.model.maxBackupHoles - 1) * holeSpacing) / 2;

            for (let i = 0; i < this.model.maxBackupHoles; i++) {
                const hX = startX + i * holeSpacing;
                const slot = this.model.backupHoles[i];
                const container = this.add.container(hX, 0);

                const holeBg = this.add.circle(0, 0, 20, slot.isUnlocked ? 0x2B2D42 : 0x181820);
                holeBg.setStrokeStyle(2, slot.isUnlocked ? 0x8D99AE : 0x333333);

                let lockIcon = null;
                if (!slot.isUnlocked) {
                    lockIcon = this.add.text(0, 0, '🔒', { fontSize: '13px' }).setOrigin(0.5);
                    container.add(lockIcon);
                }

                container.add([holeBg]);
                this.backupContainer.add(container);

                this.backupHoleViews.push({
                    container,
                    bg: holeBg,
                    lockIcon,
                    slotIndex: i,
                    worldPosition: () => ({
                        x: this.backupContainer.x + container.x,
                        y: this.backupContainer.y + container.y
                    })
                });
            }
        }

        onScrewTapped(screwId) {
            if (this.isInputLocked) return;
            this.model.handleScrewTap(screwId);
        }

        bindModelEvents() {
            this.model.on('SCREW_MOVED_TO_BOX', data => this.animateScrewToBox(data));
            this.model.on('SCREW_MOVED_TO_BACKUP', data => this.animateScrewToBackup(data));
            this.model.on('SCREW_PULLED_FROM_BACKUP', data => this.animateScrewFromBackupToBox(data));
            this.model.on('PLATE_DETACHED', data => this.animatePlateFall(data.plateId));
            this.model.on('BOX_COMPLETED', data => this.animateBoxCompleted(data));
            this.model.on('BOX_SPAWNED', data => this.animateBoxSpawned(data));
            this.model.on('TAP_REJECTED', data => this.animateTapRejected(data));
            this.model.on('GAME_OVER_WIN', data => this.handleWin(data));
            this.model.on('GAME_OVER_LOSS', data => this.handleLoss(data));
        }

        animateScrewToBox(data) {
            const screwView = this.screwViews.get(data.screwId);
            if (!screwView) return;

            const boxView = this.boxViews[data.boxIndex];
            const slotIndex = data.currentScrewsInBox - 1;
            const slotOffset = (slotIndex - 1) * 30;

            const targetWorldX = this.boxContainer.x + boxView.container.x + slotOffset;
            const targetWorldY = this.boxContainer.y + boxView.container.y;

            this.tweens.add({
                targets: screwView.container,
                angle: -360,
                scale: 1.25,
                duration: 140,
                ease: 'Quad.easeOut',
                onComplete: () => {
                    this.tweens.add({
                        targets: screwView.container,
                        x: targetWorldX,
                        y: targetWorldY,
                        scale: 0.85,
                        duration: 320,
                        ease: 'Cubic.easeInOut'
                    });
                }
            });
        }

        animateScrewToBackup(data) {
            const screwView = this.screwViews.get(data.screwId);
            const holeView = this.backupHoleViews[data.holeIndex];
            if (!screwView || !holeView) return;

            const targetPos = holeView.worldPosition();

            this.tweens.add({
                targets: screwView.container,
                angle: -360,
                scale: 1.25,
                duration: 140,
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
            const slotOffset = (slotIndex - 1) * 30;

            const targetX = this.boxContainer.x + boxView.container.x + slotOffset;
            const targetY = this.boxContainer.y + boxView.container.y;

            this.tweens.add({
                targets: screwView.container,
                x: targetX,
                y: targetY,
                duration: 280,
                delay: slotIndex * 70,
                ease: 'Back.easeOut'
            });
        }

        animatePlateFall(plateId) {
            const plateView = this.plateViews.get(plateId);
            if (!plateView) return;

            const plate = plateView.container;
            const randomAngle = (typeof Phaser !== 'undefined' && Phaser.Math)
                ? Phaser.Math.Between(-25, 25)
                : (Math.random() * 50 - 25);

            this.tweens.add({
                targets: plate,
                y: plate.y + 400,
                angle: randomAngle,
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
                scaleX: 1.15,
                scaleY: 1.15,
                duration: 150,
                yoyo: true,
                onComplete: () => {
                    this.tweens.add({
                        targets: boxView.container,
                        x: -200,
                        alpha: 0,
                        duration: 300,
                        ease: 'Back.easeIn',
                        onComplete: () => { boxView.container.destroy(); }
                    });
                }
            });
        }

        animateBoxSpawned(data) {
            const { width } = this.scale;
            const slotWidth = 120;
            const startX = width / 2 - ((this.model.unlockedActiveBoxes - 1) * slotWidth) / 2;
            const targetX = startX + data.boxIndex * slotWidth;

            const activeBoxData = this.model.activeBoxes[data.boxIndex];
            const newBoxView = this.createBoxView(width + 150, 0, activeBoxData, data.boxIndex);
            this.boxContainer.add(newBoxView.container);
            this.boxViews[data.boxIndex] = newBoxView;

            this.tweens.add({
                targets: newBoxView.container,
                x: targetX,
                duration: 350,
                ease: 'Cubic.easeOut'
            });
        }

        animateTapRejected(data) {
            const screwView = this.screwViews.get(data.screwId);
            if (!screwView) return;

            const origX = screwView.container.x;
            this.tweens.add({
                targets: screwView.container,
                x: origX - 6,
                duration: 40,
                yoyo: true,
                repeat: 3,
                onComplete: () => { screwView.container.x = origX; }
            });
        }

        handleWin() {
            const { width, height } = this.scale;
            const banner = this.add.text(width / 2, height / 2, 'LEVEL CLEARED! 🎉', {
                fontSize: '32px',
                fontStyle: 'bold',
                color: '#4ADE80',
                backgroundColor: '#111827DD',
                padding: { x: 20, y: 12 }
            }).setOrigin(0.5).setDepth(1000).setScale(0);

            this.tweens.add({
                targets: banner,
                scale: 1,
                duration: 500,
                ease: 'Back.easeOut'
            });
        }

        handleLoss() {
            const { width, height } = this.scale;
            const banner = this.add.text(width / 2, height / 2, 'OUT OF MOVES! 💥', {
                fontSize: '32px',
                fontStyle: 'bold',
                color: '#EF4444',
                backgroundColor: '#111827DD',
                padding: { x: 20, y: 12 }
            }).setOrigin(0.5).setDepth(1000).setScale(0);

            this.tweens.add({
                targets: banner,
                scale: 1,
                duration: 500,
                ease: 'Back.easeOut'
            });
        }
    }

    /**
     * ------------------------------------------------------------------------
     * 4. SAMPLE LEVEL DATA
     * ------------------------------------------------------------------------
     */
    const SampleLevel = {
        levelId: 'level_01',
        initialActiveBoxes: 2,
        maxActiveBoxes: 4,
        initialBackupHoles: 5,
        maxBackupHoles: 7,

        // 4 colors x 3 screws each = 12 screws total
        boxQueue: ['#FF3B30', '#34C759', '#007AFF', '#FFCC00'],

        plates: [
            {
                id: 'plate_wood_bottom',
                x: 180,
                y: 340,
                width: 220,
                height: 120,
                layer: 0,
                color: 0x8C5A3C,
                requiredScrewIds: ['screw_r1', 'screw_r2']
            },
            {
                id: 'plate_metal_top',
                x: 180,
                y: 340,
                width: 140,
                height: 80,
                layer: 1,
                color: 0x94A3B8,
                requiredScrewIds: ['screw_g1', 'screw_g2']
            }
        ],

        screws: [
            // Screws on top plate (Layer 1)
            { id: 'screw_g1', color: '#34C759', x: 140, y: 340, layer: 1, boundPlateIds: ['plate_metal_top'] },
            { id: 'screw_g2', color: '#34C759', x: 220, y: 340, layer: 1, boundPlateIds: ['plate_metal_top'] },
            { id: 'screw_g3', color: '#34C759', x: 310, y: 220, layer: 0, boundPlateIds: [] },

            // Screws on bottom plate (Layer 0)
            { id: 'screw_r1', color: '#FF3B30', x: 90,  y: 340, layer: 0, boundPlateIds: ['plate_wood_bottom'] },
            { id: 'screw_r2', color: '#FF3B30', x: 270, y: 340, layer: 0, boundPlateIds: ['plate_wood_bottom'] },
            { id: 'screw_r3', color: '#FF3B30', x: 70,  y: 220, layer: 0, boundPlateIds: [] },

            // Loose Blue Screws
            { id: 'screw_b1', color: '#007AFF', x: 120, y: 460, layer: 0, boundPlateIds: [] },
            { id: 'screw_b2', color: '#007AFF', x: 180, y: 460, layer: 0, boundPlateIds: [] },
            { id: 'screw_b3', color: '#007AFF', x: 240, y: 460, layer: 0, boundPlateIds: [] },

            // Loose Yellow Screws
            { id: 'screw_y1', color: '#FFCC00', x: 120, y: 530, layer: 0, boundPlateIds: [] },
            { id: 'screw_y2', color: '#FFCC00', x: 180, y: 530, layer: 0, boundPlateIds: [] },
            { id: 'screw_y3', color: '#FFCC00', x: 240, y: 530, layer: 0, boundPlateIds: [] }
        ]
    };

    return {
        LevelValidator,
        UnscrewGameModel,
        UnscrewPuzzleScene,
        SampleLevel
    };
}));
