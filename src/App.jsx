import { useState, useCallback } from 'react'
import './App.css'
import TargetPractice from './TargetPractice'

// PSA (Perfect Sensitivity Approximation) algorithm
// Binary search to find the user's ideal sensitivity

const MIN_SENS = 0.01
const MAX_SENS = 10
const ITERATIONS = 12 // Достаточно для точности ~0.001

function App() {
    const [stage, setStage] = useState('intro') // intro, setup, test, result, practice
    const [currentSens, setCurrentSens] = useState(null)
    const [lowBound, setLowBound] = useState(MIN_SENS)
    const [highBound, setHighBound] = useState(MAX_SENS)
    const [iteration, setIteration] = useState(0)
    const [dpi, setDpi] = useState(800)
    const [finalSens, setFinalSens] = useState(null)
    const [practiceResults, setPracticeResults] = useState(null)

    const startTest = useCallback(() => {
        const midSens = (MIN_SENS + MAX_SENS) / 2
        setCurrentSens(midSens)
        setLowBound(MIN_SENS)
        setHighBound(MAX_SENS)
        setIteration(1)
        setStage('test')
    }, [])

    const startPractice = useCallback(() => {
        setStage('practice')
    }, [])

    const handlePracticeComplete = useCallback((results) => {
        setPracticeResults(results)
        setStage('intro')
    }, [])

    const handleResponse = useCallback((tooFast) => {
        let newLow = lowBound
        let newHigh = highBound

        if (tooFast) {
            // Чувствительность слишком высокая, ищем ниже
            newHigh = currentSens
        } else {
            // Чувствительность слишком низкая, ищем выше
            newLow = currentSens
        }

        const nextIteration = iteration + 1

        if (nextIteration > ITERATIONS) {
            // Завершаем тест
            const result = (newLow + newHigh) / 2
            setFinalSens(result)
            setStage('result')
        } else {
            // Продолжаем бинарный поиск
            const midSens = (newLow + newHigh) / 2
            setLowBound(newLow)
            setHighBound(newHigh)
            setCurrentSens(midSens)
            setIteration(nextIteration)
        }
    }, [lowBound, highBound, currentSens, iteration])

    const resetTest = useCallback(() => {
        setStage('intro')
        setCurrentSens(null)
        setLowBound(MIN_SENS)
        setHighBound(MAX_SENS)
        setIteration(0)
        setFinalSens(null)
    }, [])

    const copyToClipboard = useCallback((text) => {
        navigator.clipboard.writeText(text)
    }, [])

    const calculateEDPI = () => {
        if (!finalSens) return 0
        return Math.round(dpi * finalSens)
    }

    return (
        <div className="app">
            <header className="header">
                <div className="logo">
                    <span className="logo-icon">🎯</span>
                    <span className="logo-text">CS2 <span className="text-gradient">Sens Finder</span></span>
                </div>
            </header>

            <main className="main container">
                {stage === 'intro' && (
                    <div className="intro animate-fade-in">
                        <h1 className="intro-title">
                            Найди свою <span className="text-gradient">идеальную</span> чувствительность
                        </h1>
                        <p className="intro-description">
                            Выбери способ тестирования чувствительности для Counter-Strike 2
                        </p>

                        <div className="mode-selection">
                            <div className="mode-card card" onClick={startPractice}>
                                <span className="mode-icon">🎯</span>
                                <h3>Машинный анализ</h3>
                                <p>Тренируйся на мишенях прямо в браузере. Алгоритм проанализирует твои движения и определит, подходит ли тебе текущая чувствительность.</p>
                                <ul className="mode-features">
                                    <li>✅ Анализ перелётов и коррекций</li>
                                    <li>✅ Измерение времени реакции</li>
                                    <li>✅ Рекомендации по настройке</li>
                                </ul>
                                <span className="mode-badge">Рекомендуется</span>
                            </div>

                            <div className="mode-card card" onClick={() => setStage('setup')}>
                                <span className="mode-icon">🎮</span>
                                <h3>Тест в CS2</h3>
                                <p>Классический бинарный поиск. Тестируй чувствительность прямо в игре и отвечай на простые вопросы.</p>
                                <ul className="mode-features">
                                    <li>✅ Тест в реальных условиях</li>
                                    <li>✅ {ITERATIONS} итераций</li>
                                    <li>✅ Точность до 0.001</li>
                                </ul>
                            </div>
                        </div>

                        {practiceResults && (
                            <div className="last-practice-results card animate-fade-in">
                                <h4>📊 Последний результат анализа</h4>
                                <div className="lpr-stats">
                                    <span>Время: <strong>{practiceResults.avgTime}ms</strong></span>
                                    <span>Перелётов: <strong>{practiceResults.totalOvershoots}</strong></span>
                                    <span>Стабильность: <strong>{practiceResults.avgConsistency}%</strong></span>
                                </div>
                                <p className={`lpr-recommendation lpr-${practiceResults.recommendation}`}>
                                    {practiceResults.recommendation === 'decrease' && '⬇️ Рекомендуется уменьшить sens'}
                                    {practiceResults.recommendation === 'increase' && '⬆️ Рекомендуется увеличить sens'}
                                    {practiceResults.recommendation === 'perfect' && '✅ Чувствительность подходит!'}
                                </p>
                            </div>
                        )}
                    </div>
                )}

                {stage === 'setup' && (
                    <div className="intro animate-fade-in">
                        <button className="btn btn-secondary back-btn" onClick={() => setStage('intro')}>
                            ← Назад
                        </button>

                        <h2 className="setup-main-title">Тест в CS2</h2>

                        <div className="setup-card card animate-fade-in">
                            <h3 className="setup-title">Настройка</h3>
                            <div className="input-group">
                                <label htmlFor="dpi">Твой DPI мыши</label>
                                <input
                                    type="number"
                                    id="dpi"
                                    className="input"
                                    value={dpi}
                                    onChange={(e) => setDpi(Number(e.target.value) || 800)}
                                    min="100"
                                    max="25600"
                                    placeholder="800"
                                />
                            </div>
                            <p className="setup-hint">
                                Если не знаешь свой DPI, скорее всего это 800 или 1600
                            </p>
                        </div>

                        <div className="instructions card">
                            <h3>📋 Инструкция</h3>
                            <ol>
                                <li>Открой CS2 и зайди на любую карту</li>
                                <li>Открой консоль (<code>~</code>)</li>
                                <li>Для каждой итерации будет команда для консоли</li>
                                <li>После ввода команды сделай несколько движений мышью</li>
                                <li>Ответь: прицел двигается слишком быстро или медленно?</li>
                            </ol>
                        </div>

                        <button className="btn btn-primary btn-large" onClick={startTest}>
                            Начать тест 🚀
                        </button>
                    </div>
                )}

                {stage === 'test' && (
                    <div className="test animate-fade-in">
                        <div className="progress-container">
                            <div className="progress-label">
                                <span>Итерация {iteration} из {ITERATIONS}</span>
                                <span>{Math.round((iteration / ITERATIONS) * 100)}%</span>
                            </div>
                            <div className="progress-bar">
                                <div
                                    className="progress-fill"
                                    style={{ width: `${(iteration / ITERATIONS) * 100}%` }}
                                />
                            </div>
                        </div>

                        <div className="test-card card card-glow animate-pulse">
                            <h2 className="test-title">Тестируй эту чувствительность</h2>

                            <div className="sens-display">
                                <span className="sens-value text-gradient">
                                    {currentSens.toFixed(3)}
                                </span>
                                <span className="sens-label">sensitivity</span>
                            </div>

                            <div className="command-box">
                                <code className="command">sensitivity {currentSens.toFixed(3)}</code>
                                <button
                                    className="btn btn-secondary copy-btn"
                                    onClick={() => copyToClipboard(`sensitivity ${currentSens.toFixed(3)}`)}
                                >
                                    📋 Копировать
                                </button>
                            </div>

                            <p className="test-instruction">
                                Вставь эту команду в консоль CS2, затем подвигай мышью и оцени ощущения
                            </p>
                        </div>

                        <div className="response-buttons">
                            <button
                                className="btn btn-response btn-too-fast"
                                onClick={() => handleResponse(true)}
                            >
                                <span className="response-icon">🐇</span>
                                <span className="response-text">Слишком быстро</span>
                            </button>
                            <button
                                className="btn btn-response btn-too-slow"
                                onClick={() => handleResponse(false)}
                            >
                                <span className="response-icon">🐢</span>
                                <span className="response-text">Слишком медленно</span>
                            </button>
                        </div>

                        <div className="range-info">
                            <span>Диапазон: {lowBound.toFixed(3)} — {highBound.toFixed(3)}</span>
                        </div>
                    </div>
                )}

                {stage === 'result' && (
                    <div className="result animate-fade-in">
                        <div className="result-header">
                            <span className="result-emoji">🎉</span>
                            <h1 className="result-title">Твоя идеальная чувствительность</h1>
                        </div>

                        <div className="result-card card card-glow">
                            <div className="result-main">
                                <span className="result-value text-gradient">
                                    {finalSens.toFixed(3)}
                                </span>
                                <span className="result-label">sensitivity</span>
                            </div>

                            <div className="result-stats">
                                <div className="stat">
                                    <span className="stat-value">{dpi}</span>
                                    <span className="stat-label">DPI</span>
                                </div>
                                <div className="stat">
                                    <span className="stat-value">{calculateEDPI()}</span>
                                    <span className="stat-label">eDPI</span>
                                </div>
                                <div className="stat">
                                    <span className="stat-value">{(2.54 / (dpi * finalSens * 0.022)).toFixed(1)}</span>
                                    <span className="stat-label">cm/360°</span>
                                </div>
                            </div>
                        </div>

                        <div className="commands-section card">
                            <h3>🎮 Команды для CS2</h3>

                            <div className="command-item">
                                <span className="command-desc">Установить чувствительность:</span>
                                <div className="command-box">
                                    <code className="command">sensitivity {finalSens.toFixed(3)}</code>
                                    <button
                                        className="btn btn-secondary copy-btn"
                                        onClick={() => copyToClipboard(`sensitivity ${finalSens.toFixed(3)}`)}
                                    >
                                        📋
                                    </button>
                                </div>
                            </div>

                            <div className="command-item">
                                <span className="command-desc">Добавить в autoexec.cfg:</span>
                                <div className="command-box">
                                    <code className="command">sensitivity "{finalSens.toFixed(3)}"</code>
                                    <button
                                        className="btn btn-secondary copy-btn"
                                        onClick={() => copyToClipboard(`sensitivity "${finalSens.toFixed(3)}"`)}
                                    >
                                        📋
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="result-actions">
                            <button className="btn btn-primary btn-large" onClick={resetTest}>
                                Пройти тест заново 🔄
                            </button>
                        </div>

                        <div className="tips card">
                            <h3>💡 Советы</h3>
                            <ul>
                                <li>Играй с этой чувствительностью минимум неделю перед изменениями</li>
                                <li>eDPI большинства про-игроков находится в диапазоне 400-1200</li>
                                <li>Твой cm/360° показывает, сколько сантиметров нужно для поворота на 360°</li>
                            </ul>
                        </div>
                    </div>
                )}

                {stage === 'practice' && (
                    <TargetPractice
                        onComplete={handlePracticeComplete}
                        onBack={() => setStage('intro')}
                    />
                )}
            </main>

            <footer className="footer">
                <p>Made with ❤️ for CS2 players</p>
            </footer>
        </div>
    )
}

export default App
