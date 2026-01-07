import { useState, useRef, useEffect, useCallback } from 'react'
import './TargetPractice.css'

const CANVAS_WIDTH = 800
const CANVAS_HEIGHT = 600
const TARGET_RADIUS = 25
const CROSSHAIR_SIZE = 20
const TARGETS_PER_ROUND = 6
const TRACKING_DURATION = 5000 // 5 секунд трекинга

// Генерируем значения чувствительности для тестирования
function generateTestSensitivities(baseSens) {
    // Тестируем: 75%, 90%, 100%, 110%, 125% от базовой
    const multipliers = [0.75, 0.9, 1.0, 1.1, 1.25]
    return multipliers.map(m => ({
        sensitivity: Math.round(baseSens * m * 1000) / 1000,
        multiplier: m,
        label: m === 1.0 ? 'Текущая' : (m < 1 ? `${Math.round((1 - m) * 100)}% ниже` : `${Math.round((m - 1) * 100)}% выше`)
    })).sort(() => Math.random() - 0.5) // Перемешиваем
}

// Анализ движения для accuracy теста
function analyzeAccuracyMovement(movements) {
    if (movements.length < 2) {
        return { overshoots: 0, corrections: 0, avgSpeed: 0, pathEfficiency: 100 }
    }

    let overshoots = 0
    let corrections = 0
    let totalDistance = 0
    let lastDirection = null

    for (let i = 1; i < movements.length; i++) {
        const prev = movements[i - 1]
        const curr = movements[i]

        const dx = curr.x - prev.x
        const dy = curr.y - prev.y
        const distance = Math.sqrt(dx * dx + dy * dy)
        totalDistance += distance

        const direction = Math.atan2(dy, dx)

        if (lastDirection !== null && distance > 3) {
            const angleDiff = Math.abs(direction - lastDirection)
            const normalizedDiff = Math.min(angleDiff, 2 * Math.PI - angleDiff)

            if (normalizedDiff > Math.PI / 2) {
                corrections++
                if (distance > 15) {
                    overshoots++
                }
            }
        }

        lastDirection = direction
    }

    // Эффективность пути: прямая дистанция / пройденная дистанция
    const startPos = movements[0]
    const endPos = movements[movements.length - 1]
    const directDistance = Math.sqrt((endPos.x - startPos.x) ** 2 + (endPos.y - startPos.y) ** 2)
    const pathEfficiency = totalDistance > 0 ? Math.min(100, (directDistance / totalDistance) * 100) : 100

    return { overshoots, corrections, totalDistance, pathEfficiency }
}

// Генерация позиции цели
function generateTarget(currentPos, canvasWidth, canvasHeight, margin = 120) {
    let newX, newY
    let attempts = 0

    do {
        newX = margin + Math.random() * (canvasWidth - margin * 2)
        newY = margin + Math.random() * (canvasHeight - margin * 2)
        attempts++
    } while (
        currentPos &&
        Math.sqrt((newX - currentPos.x) ** 2 + (newY - currentPos.y) ** 2) < 180 &&
        attempts < 20
    )

    return { x: newX, y: newY }
}

// Рассчет множителя для браузера
function calculateBrowserMultiplier(dpi, sensitivity) {
    const baseDPI = 800
    const baseSens = 1.0
    const baseMultiplier = 0.5
    return (dpi / baseDPI) * (sensitivity / baseSens) * baseMultiplier
}

// Движение трекинг-цели
function getTrackingTargetPosition(time, canvasWidth, canvasHeight) {
    const centerX = canvasWidth / 2
    const centerY = canvasHeight / 2
    const radiusX = 200
    const radiusY = 120

    // Плавное движение по эллипсу с вариациями
    const speed = 0.0015
    const angle = time * speed
    const wobble = Math.sin(time * 0.003) * 30

    return {
        x: centerX + Math.cos(angle) * radiusX + Math.sin(angle * 2) * wobble,
        y: centerY + Math.sin(angle) * radiusY + Math.cos(angle * 1.5) * (wobble * 0.5)
    }
}

export default function TargetPractice({ onComplete, onBack }) {
    const canvasRef = useRef(null)
    const containerRef = useRef(null)

    // Настройки
    const [dpi, setDpi] = useState(800)
    const [baseSensitivity, setBaseSensitivity] = useState(2.0)

    // Состояние теста
    const [mode, setMode] = useState('setup') // setup, countdown, accuracy, tracking, transition, finished
    const [testSensitivities, setTestSensitivities] = useState([])
    const [currentTestIndex, setCurrentTestIndex] = useState(0)
    const [allResults, setAllResults] = useState([])
    const [testPhase, setTestPhase] = useState('accuracy') // accuracy или tracking

    // Обратный отсчёт
    const [countdown, setCountdown] = useState(3)

    // Состояние игры
    const [isLocked, setIsLocked] = useState(false)
    const [crosshair, setCrosshair] = useState({ x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 })
    const [target, setTarget] = useState(null)
    const [targetsHit, setTargetsHit] = useState(0)

    // Трекинг
    const [trackingTarget, setTrackingTarget] = useState({ x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 })
    const [trackingTimeLeft, setTrackingTimeLeft] = useState(TRACKING_DURATION)
    const trackingStartTimeRef = useRef(null)
    const trackingScoresRef = useRef([])

    // Аналитика
    const movementsRef = useRef([])
    const targetStartTimeRef = useRef(null)
    const roundHitsRef = useRef([])
    const accuracyResultRef = useRef(null)

    const browserMultiplierRef = useRef(1)
    const animationFrameRef = useRef(null)

    const currentSensitivity = testSensitivities[currentTestIndex]?.sensitivity

    // Обработка движения мыши
    const handleMouseMove = useCallback((e) => {
        if (!isLocked || (mode !== 'accuracy' && mode !== 'tracking')) return

        const movementX = e.movementX * browserMultiplierRef.current
        const movementY = e.movementY * browserMultiplierRef.current

        setCrosshair(prev => {
            const newX = Math.max(0, Math.min(CANVAS_WIDTH, prev.x + movementX))
            const newY = Math.max(0, Math.min(CANVAS_HEIGHT, prev.y + movementY))

            movementsRef.current.push({
                x: newX,
                y: newY,
                time: performance.now(),
                rawX: e.movementX,
                rawY: e.movementY
            })

            return { x: newX, y: newY }
        })
    }, [isLocked, mode])

    // Спавн новой цели для accuracy
    const spawnNewTarget = useCallback(() => {
        const newTarget = generateTarget(crosshair, CANVAS_WIDTH, CANVAS_HEIGHT)
        setTarget(newTarget)
        targetStartTimeRef.current = performance.now()
        movementsRef.current = [{ x: crosshair.x, y: crosshair.y, time: performance.now() }]
    }, [crosshair])

    // Анализ accuracy раунда
    const analyzeAccuracyRound = useCallback((hits) => {
        if (hits.length === 0) return null

        const avgTime = hits.reduce((sum, h) => sum + h.time, 0) / hits.length
        const totalOvershoots = hits.reduce((sum, h) => sum + h.overshoots, 0)
        const totalCorrections = hits.reduce((sum, h) => sum + h.corrections, 0)
        const avgPathEfficiency = hits.reduce((sum, h) => sum + h.pathEfficiency, 0) / hits.length

        return {
            avgTime: Math.round(avgTime),
            totalOvershoots,
            totalCorrections,
            avgPathEfficiency: Math.round(avgPathEfficiency)
        }
    }, [])

    // Анализ tracking
    const analyzeTracking = useCallback((scores) => {
        if (scores.length === 0) return null

        const avgDistance = scores.reduce((sum, s) => sum + s, 0) / scores.length
        // Чем меньше среднее расстояние, тем лучше
        // Нормализуем: 0 расстояние = 100 баллов, 100 расстояние = 0 баллов
        const trackingScore = Math.max(0, Math.round(100 - avgDistance))

        return {
            avgDistance: Math.round(avgDistance),
            trackingScore
        }
    }, [])

    // Завершение accuracy фазы
    const finishAccuracyPhase = useCallback(() => {
        const hits = roundHitsRef.current
        const result = analyzeAccuracyRound(hits)
        accuracyResultRef.current = result

        // Переходим к трекингу
        setTestPhase('tracking')
        setMode('transition')

        setTimeout(() => {
            startTrackingPhase()
        }, 1500)
    }, [analyzeAccuracyRound])

    // Начало tracking фазы
    const startTrackingPhase = useCallback(() => {
        setMode('tracking')
        setTrackingTimeLeft(TRACKING_DURATION)
        trackingStartTimeRef.current = performance.now()
        trackingScoresRef.current = []
        setCrosshair({ x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 })
        containerRef.current?.requestPointerLock()
    }, [])

    // Завершение tracking фазы
    const finishTrackingPhase = useCallback(() => {
        const trackingResult = analyzeTracking(trackingScoresRef.current)
        const accuracyResult = accuracyResultRef.current

        if (!accuracyResult || !trackingResult) return

        // Комбинированная оценка
        // Штрафуем сильнее за перелёты (это признак слишком высокой sens)
        const overshootPenalty = accuracyResult.totalOvershoots * 8
        const correctionPenalty = accuracyResult.totalCorrections * 3
        const timePenalty = Math.max(0, (accuracyResult.avgTime - 350) / 5)

        // Бонус за эффективность пути (низкая sens даёт более прямые пути)
        const pathBonus = accuracyResult.avgPathEfficiency * 0.3

        // Трекинг важен для баланса
        const trackingBonus = trackingResult.trackingScore * 0.4

        // Базовая оценка с балансировкой
        const baseScore = 100
        const accuracyScore = baseScore - overshootPenalty - correctionPenalty - timePenalty + pathBonus
        const combinedScore = Math.round((accuracyScore * 0.6 + trackingResult.trackingScore * 0.4))

        const result = {
            sensitivity: currentSensitivity,
            accuracyTime: accuracyResult.avgTime,
            overshoots: accuracyResult.totalOvershoots,
            corrections: accuracyResult.totalCorrections,
            pathEfficiency: accuracyResult.avgPathEfficiency,
            trackingScore: trackingResult.trackingScore,
            trackingDistance: trackingResult.avgDistance,
            combinedScore: Math.max(0, Math.min(100, combinedScore))
        }

        setAllResults(prev => [...prev, result])

        const nextIndex = currentTestIndex + 1

        if (nextIndex >= testSensitivities.length) {
            document.exitPointerLock()
            setMode('finished')
        } else {
            setMode('transition')
            setCurrentTestIndex(nextIndex)
            setTestPhase('accuracy')

            setTimeout(() => {
                startAccuracyPhase(nextIndex)
            }, 1500)
        }
    }, [analyzeTracking, currentSensitivity, currentTestIndex, testSensitivities.length])

    // Трекинг анимация
    useEffect(() => {
        if (mode !== 'tracking') return

        const animate = () => {
            const elapsed = performance.now() - trackingStartTimeRef.current
            const remaining = TRACKING_DURATION - elapsed

            if (remaining <= 0) {
                finishTrackingPhase()
                return
            }

            setTrackingTimeLeft(remaining)

            // Обновляем позицию цели
            const newPos = getTrackingTargetPosition(performance.now(), CANVAS_WIDTH, CANVAS_HEIGHT)
            setTrackingTarget(newPos)

            // Записываем расстояние до цели
            const currentCrosshair = crosshair
            const distance = Math.sqrt(
                (currentCrosshair.x - newPos.x) ** 2 +
                (currentCrosshair.y - newPos.y) ** 2
            )
            trackingScoresRef.current.push(distance)

            animationFrameRef.current = requestAnimationFrame(animate)
        }

        animationFrameRef.current = requestAnimationFrame(animate)

        return () => {
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current)
            }
        }
    }, [mode, crosshair, finishTrackingPhase])

    // Проверка попадания для accuracy
    const checkHit = useCallback(() => {
        if (!target || mode !== 'accuracy') return

        const dx = crosshair.x - target.x
        const dy = crosshair.y - target.y
        const distance = Math.sqrt(dx * dx + dy * dy)

        if (distance <= TARGET_RADIUS) {
            const hitTime = performance.now() - targetStartTimeRef.current
            const analysis = analyzeAccuracyMovement(movementsRef.current)

            roundHitsRef.current.push({
                time: hitTime,
                ...analysis
            })

            setTargetsHit(prev => {
                const newCount = prev + 1
                if (newCount >= TARGETS_PER_ROUND) {
                    setTimeout(finishAccuracyPhase, 100)
                } else {
                    spawnNewTarget()
                }
                return newCount
            })
        }
    }, [crosshair, target, mode, finishAccuracyPhase, spawnNewTarget])

    // Клик
    const handleClick = useCallback(() => {
        if (mode === 'accuracy') {
            if (!isLocked) {
                containerRef.current?.requestPointerLock()
            } else {
                checkHit()
            }
        }
    }, [isLocked, mode, checkHit])

    // Начать accuracy фазу
    const startAccuracyPhase = useCallback((testIndex) => {
        const sens = testSensitivities[testIndex]?.sensitivity
        if (!sens) return

        browserMultiplierRef.current = calculateBrowserMultiplier(dpi, sens)

        setTargetsHit(0)
        roundHitsRef.current = []
        accuracyResultRef.current = null
        setCrosshair({ x: CANVAS_WIDTH / 2, y: CANVAS_HEIGHT / 2 })

        setMode('accuracy')
        spawnNewTarget()
        containerRef.current?.requestPointerLock()
    }, [dpi, testSensitivities, spawnNewTarget])

    // Начать весь тест
    const startTest = useCallback(() => {
        const sensitivities = generateTestSensitivities(baseSensitivity)
        setTestSensitivities(sensitivities)
        setCurrentTestIndex(0)
        setAllResults([])
        setTestPhase('accuracy')
        setCountdown(3)
        setMode('countdown')
    }, [baseSensitivity])

    // Эффект обратного отсчёта
    useEffect(() => {
        if (mode !== 'countdown') return

        if (countdown > 0) {
            const timer = setTimeout(() => setCountdown(countdown - 1), 1000)
            return () => clearTimeout(timer)
        } else {
            startAccuracyPhase(0)
        }
    }, [mode, countdown, startAccuracyPhase])

    // Pointer Lock events
    useEffect(() => {
        const handleLockChange = () => {
            setIsLocked(document.pointerLockElement === containerRef.current)
        }

        document.addEventListener('pointerlockchange', handleLockChange)
        document.addEventListener('mousemove', handleMouseMove)

        return () => {
            document.removeEventListener('pointerlockchange', handleLockChange)
            document.removeEventListener('mousemove', handleMouseMove)
        }
    }, [handleMouseMove])

    // Рендер canvas
    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return

        const ctx = canvas.getContext('2d')

        // Clear
        ctx.fillStyle = '#0a0e13'
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)

        // Grid
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)'
        ctx.lineWidth = 1
        for (let x = 0; x < CANVAS_WIDTH; x += 50) {
            ctx.beginPath()
            ctx.moveTo(x, 0)
            ctx.lineTo(x, CANVAS_HEIGHT)
            ctx.stroke()
        }
        for (let y = 0; y < CANVAS_HEIGHT; y += 50) {
            ctx.beginPath()
            ctx.moveTo(0, y)
            ctx.lineTo(CANVAS_WIDTH, y)
            ctx.stroke()
        }

        // Accuracy Target
        if (target && mode === 'accuracy') {
            const gradient = ctx.createRadialGradient(
                target.x, target.y, 0,
                target.x, target.y, TARGET_RADIUS * 1.5
            )
            gradient.addColorStop(0, 'rgba(255, 111, 0, 0.3)')
            gradient.addColorStop(1, 'rgba(255, 111, 0, 0)')
            ctx.fillStyle = gradient
            ctx.beginPath()
            ctx.arc(target.x, target.y, TARGET_RADIUS * 1.5, 0, Math.PI * 2)
            ctx.fill()

            ctx.fillStyle = '#ff6f00'
            ctx.beginPath()
            ctx.arc(target.x, target.y, TARGET_RADIUS, 0, Math.PI * 2)
            ctx.fill()

            ctx.fillStyle = '#fff'
            ctx.beginPath()
            ctx.arc(target.x, target.y, TARGET_RADIUS / 3, 0, Math.PI * 2)
            ctx.fill()
        }

        // Tracking Target
        if (mode === 'tracking') {
            const gradient = ctx.createRadialGradient(
                trackingTarget.x, trackingTarget.y, 0,
                trackingTarget.x, trackingTarget.y, 50
            )
            gradient.addColorStop(0, 'rgba(0, 188, 212, 0.4)')
            gradient.addColorStop(1, 'rgba(0, 188, 212, 0)')
            ctx.fillStyle = gradient
            ctx.beginPath()
            ctx.arc(trackingTarget.x, trackingTarget.y, 50, 0, Math.PI * 2)
            ctx.fill()

            ctx.fillStyle = '#00bcd4'
            ctx.beginPath()
            ctx.arc(trackingTarget.x, trackingTarget.y, 20, 0, Math.PI * 2)
            ctx.fill()

            ctx.fillStyle = '#fff'
            ctx.beginPath()
            ctx.arc(trackingTarget.x, trackingTarget.y, 6, 0, Math.PI * 2)
            ctx.fill()
        }

        // Crosshair
        const crosshairColor = mode === 'tracking' ? '#ff6f00' : '#00bcd4'
        ctx.strokeStyle = crosshairColor
        ctx.lineWidth = 2
        ctx.shadowColor = crosshairColor
        ctx.shadowBlur = 10

        ctx.beginPath()
        ctx.moveTo(crosshair.x - CROSSHAIR_SIZE, crosshair.y)
        ctx.lineTo(crosshair.x - 5, crosshair.y)
        ctx.moveTo(crosshair.x + 5, crosshair.y)
        ctx.lineTo(crosshair.x + CROSSHAIR_SIZE, crosshair.y)
        ctx.stroke()

        ctx.beginPath()
        ctx.moveTo(crosshair.x, crosshair.y - CROSSHAIR_SIZE)
        ctx.lineTo(crosshair.x, crosshair.y - 5)
        ctx.moveTo(crosshair.x, crosshair.y + 5)
        ctx.lineTo(crosshair.x, crosshair.y + CROSSHAIR_SIZE)
        ctx.stroke()

        ctx.fillStyle = crosshairColor
        ctx.beginPath()
        ctx.arc(crosshair.x, crosshair.y, 2, 0, Math.PI * 2)
        ctx.fill()

        ctx.shadowBlur = 0
    }, [crosshair, target, trackingTarget, mode])

    // Расчёт статистики
    const calculateStats = (sens) => {
        const edpi = Math.round(dpi * sens)
        const cm360 = (2.54 / (dpi * sens * 0.022)).toFixed(1)
        return { edpi, cm360 }
    }

    // Лучший результат
    const getBestResult = () => {
        if (allResults.length === 0) return null
        return allResults.reduce((best, curr) =>
            curr.combinedScore > best.combinedScore ? curr : best
        )
    }

    const bestResult = getBestResult()

    return (
        <div className="target-practice">
            <div className="tp-header">
                <button className="btn btn-secondary" onClick={onBack}>
                    ← Назад
                </button>
                <h2>Поиск идеальной чувствительности</h2>
            </div>

            {mode === 'setup' && (
                <div className="tp-setup card animate-fade-in">
                    <h3>⚙️ Настройка</h3>

                    <div className="tp-settings-grid">
                        <div className="input-group">
                            <label htmlFor="dpi">DPI мыши</label>
                            <input
                                type="number"
                                id="dpi"
                                className="input"
                                value={dpi}
                                onChange={(e) => setDpi(Number(e.target.value) || 800)}
                                min="100"
                                max="25600"
                            />
                        </div>

                        <div className="input-group">
                            <label htmlFor="sens">Текущая чувствительность CS2</label>
                            <input
                                type="number"
                                id="sens"
                                className="input"
                                value={baseSensitivity}
                                onChange={(e) => setBaseSensitivity(Number(e.target.value) || 1)}
                                min="0.1"
                                max="10"
                                step="0.1"
                            />
                        </div>
                    </div>

                    <div className="tp-current-stats">
                        <span>eDPI: <strong>{calculateStats(baseSensitivity).edpi}</strong></span>
                        <span>cm/360°: <strong>{calculateStats(baseSensitivity).cm360}</strong></span>
                    </div>

                    <div className="tp-explanation card">
                        <h4>🔬 Как работает тест</h4>
                        <div className="tp-explanation-content">
                            <div className="tp-explanation-item">
                                <span className="tp-exp-icon">🎯</span>
                                <div>
                                    <strong>Accuracy тест</strong>
                                    <p>Кликай по мишеням как можно быстрее. Измеряем время реакции, перелёты и точность траектории.</p>
                                </div>
                            </div>
                            <div className="tp-explanation-item">
                                <span className="tp-exp-icon">🔄</span>
                                <div>
                                    <strong>Tracking тест (5 сек)</strong>
                                    <p>Следи за движущейся целью. Измеряем, насколько хорошо ты удерживаешь прицел на цели.</p>
                                </div>
                            </div>
                            <div className="tp-explanation-item">
                                <span className="tp-exp-icon">⚖️</span>
                                <div>
                                    <strong>Сбалансированная оценка</strong>
                                    <p>Перелёты штрафуются сильнее — алгоритм не предпочитает высокую sens. Оптимальная sens та, где баланс скорости и контроля.</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="tp-test-summary">
                        <p>📊 Тестируем <strong>5 значений</strong> чувствительности: 75%, 90%, 100%, 110%, 125% от текущей</p>
                        <p>⏱️ Каждое значение: <strong>{TARGETS_PER_ROUND} мишеней</strong> + <strong>5 сек трекинга</strong></p>
                        <p>🎲 Значения перемешаны — ты не будешь знать какую сенсу тестируешь</p>
                    </div>

                    <button className="btn btn-primary btn-large" onClick={startTest}>
                        Начать тест 🎯
                    </button>
                </div>
            )}

            {mode === 'countdown' && (
                <div className="tp-countdown animate-fade-in">
                    <div className="tp-countdown-number">{countdown}</div>
                    <p>Приготовься...</p>
                    <div className="tp-countdown-info">
                        Тест {currentTestIndex + 1} из {testSensitivities.length}
                    </div>
                </div>
            )}

            {(mode === 'accuracy' || mode === 'tracking' || mode === 'transition') && (
                <div className="tp-game-area animate-fade-in">
                    <div className="tp-test-info">
                        <div className="tp-progress-dots">
                            {testSensitivities.map((_, i) => (
                                <div
                                    key={i}
                                    className={`tp-dot ${i < currentTestIndex ? 'tp-dot-done' : ''} ${i === currentTestIndex ? 'tp-dot-active' : ''}`}
                                />
                            ))}
                        </div>
                        <div className="tp-phase-badge">
                            {mode === 'accuracy' && '🎯 Accuracy'}
                            {mode === 'tracking' && '🔄 Tracking'}
                            {mode === 'transition' && '✓'}
                        </div>
                    </div>

                    <div className="tp-stats">
                        {mode === 'accuracy' && (
                            <div className="tp-stat">
                                <span className="tp-stat-value">{targetsHit}</span>
                                <span className="tp-stat-label">/ {TARGETS_PER_ROUND}</span>
                            </div>
                        )}
                        {mode === 'tracking' && (
                            <div className="tp-stat">
                                <span className="tp-stat-value">{Math.ceil(trackingTimeLeft / 1000)}</span>
                                <span className="tp-stat-label">сек</span>
                            </div>
                        )}
                    </div>

                    <div
                        ref={containerRef}
                        className="tp-canvas-container"
                        onClick={handleClick}
                    >
                        <canvas
                            ref={canvasRef}
                            width={CANVAS_WIDTH}
                            height={CANVAS_HEIGHT}
                            className="tp-canvas"
                        />
                        {!isLocked && (mode === 'accuracy' || mode === 'tracking') && (
                            <div className="tp-click-prompt">
                                Кликни, чтобы начать
                            </div>
                        )}
                        {mode === 'transition' && (
                            <div className="tp-transition-overlay">
                                <div className="tp-transition-text">
                                    {testPhase === 'tracking' ? '→ Tracking тест...' : '✓ Следующий тест...'}
                                </div>
                            </div>
                        )}
                    </div>

                    {mode === 'accuracy' && (
                        <p className="tp-hint">Кликай по оранжевым мишеням</p>
                    )}
                    {mode === 'tracking' && (
                        <p className="tp-hint">Держи прицел на голубой цели</p>
                    )}
                </div>
            )}

            {mode === 'finished' && bestResult && (
                <div className="tp-final-results animate-fade-in">
                    <div className="tp-final-header">
                        <span className="tp-final-emoji">🏆</span>
                        <h2>Лучшая чувствительность для тебя</h2>
                    </div>

                    <div className="tp-final-card card card-glow">
                        <div className="tp-final-sens">
                            <span className="tp-final-sens-value text-gradient">
                                {bestResult.sensitivity.toFixed(3)}
                            </span>
                            <span className="tp-final-sens-label">sensitivity</span>
                        </div>

                        <div className="tp-final-stats">
                            <div className="stat">
                                <span className="stat-value">{dpi}</span>
                                <span className="stat-label">DPI</span>
                            </div>
                            <div className="stat">
                                <span className="stat-value">{calculateStats(bestResult.sensitivity).edpi}</span>
                                <span className="stat-label">eDPI</span>
                            </div>
                            <div className="stat">
                                <span className="stat-value">{calculateStats(bestResult.sensitivity).cm360}</span>
                                <span className="stat-label">cm/360°</span>
                            </div>
                        </div>
                    </div>

                    <div className="tp-command-section card">
                        <h4>🎮 Команда для CS2</h4>
                        <div className="command-box">
                            <code className="command">sensitivity {bestResult.sensitivity.toFixed(3)}</code>
                            <button
                                className="btn btn-secondary copy-btn"
                                onClick={() => navigator.clipboard.writeText(`sensitivity ${bestResult.sensitivity.toFixed(3)}`)}
                            >
                                📋 Копировать
                            </button>
                        </div>
                    </div>

                    <div className="tp-all-results card">
                        <h4>📊 Все результаты (отсортировано по оценке)</h4>
                        <div className="tp-results-table">
                            <div className="tp-results-header">
                                <span>Sens</span>
                                <span>Время</span>
                                <span>Перелёты</span>
                                <span>Трекинг</span>
                                <span>Оценка</span>
                            </div>
                            {allResults
                                .sort((a, b) => b.combinedScore - a.combinedScore)
                                .map((result, i) => (
                                    <div
                                        key={i}
                                        className={`tp-results-row ${result.sensitivity === bestResult.sensitivity ? 'tp-results-best' : ''}`}
                                    >
                                        <span className="tp-results-sens">{result.sensitivity.toFixed(3)}</span>
                                        <span>{result.accuracyTime}ms</span>
                                        <span className={result.overshoots > 3 ? 'tp-bad' : ''}>{result.overshoots}</span>
                                        <span>{result.trackingScore}</span>
                                        <span className="tp-results-score">{result.combinedScore}</span>
                                    </div>
                                ))
                            }
                        </div>
                    </div>

                    <div className="tp-comparison">
                        {bestResult.sensitivity !== baseSensitivity && (
                            <p className="tp-comparison-text">
                                {bestResult.sensitivity > baseSensitivity ? '⬆️' : '⬇️'}
                                {' '}Рекомендуется {bestResult.sensitivity > baseSensitivity ? 'увеличить' : 'уменьшить'} чувствительность
                                с {baseSensitivity.toFixed(3)} до <strong>{bestResult.sensitivity.toFixed(3)}</strong>
                            </p>
                        )}
                        {bestResult.sensitivity === baseSensitivity && (
                            <p className="tp-comparison-text tp-comparison-perfect">
                                ✅ Твоя текущая чувствительность оптимальна!
                            </p>
                        )}
                    </div>

                    <div className="tp-actions">
                        <button className="btn btn-secondary" onClick={() => {
                            setMode('setup')
                            setAllResults([])
                        }}>
                            Пройти заново 🔄
                        </button>
                        <button className="btn btn-primary" onClick={() => onComplete({
                            sensitivity: bestResult.sensitivity,
                            dpi,
                            allResults
                        })}>
                            Готово ✓
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
