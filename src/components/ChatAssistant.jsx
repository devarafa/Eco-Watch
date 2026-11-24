import { useEffect, useRef, useState } from 'react';
import { AI_SOURCES, CHAT_SIZE_KEY } from '../lib/config.js';
import { clamp, hasNonLatin, signed } from '../lib/format.js';
import { readSession, subscribeToSession } from '../lib/session.js';

const DEFAULT_SIZE = { width: 340, height: 560 };
const MOBILE_QUERY = '(max-width: 820px)';

const SYSTEM_PROMPT = [
  'You are Eco Watch AI, a friendly assistant inside a free, open-source educational web app.',
  'Eco Watch compares Sentinel-2 satellite scenes for any area over two dates or a 3 to 5 year timeline, reads NDVI, NDWI and NDBI pixels, applies Sentinel-2 SCL masks, runs a WorldCover-assisted classifier, and builds a decision brief with changed-area estimates and two actions.',
  'Answer in clear conversational English only. Never use Arabic or any other non-Latin script. Use two to four sentences when the question allows it.',
  'You may answer general questions, explain technical terms, and chat naturally about the project.',
  'Use the current analysis context when it is present. Never invent percentages, scene IDs, dates or classifications that are not in the context.',
  'If you are not sure, say so plainly. Do not use markdown tables. Do not ask for private or sensitive information.'
].join(' ');

function isMobile() {
  return typeof window !== 'undefined' && window.matchMedia(MOBILE_QUERY).matches;
}

function readStoredSize() {
  try {
    const raw = localStorage.getItem(CHAT_SIZE_KEY);
    if (!raw) {
      return { ...DEFAULT_SIZE };
    }
    const parsed = JSON.parse(raw);
    return {
      width: clamp(Number(parsed.width) || DEFAULT_SIZE.width, 300, 520),
      height: clamp(Number(parsed.height) || DEFAULT_SIZE.height, 300, 780)
    };
  } catch (error) {
    return { ...DEFAULT_SIZE };
  }
}

function shortNumber(value, digits = 1) {
  return Number.isFinite(value) ? value.toFixed(digits) : '-';
}

function periodText(session) {
  if (Array.isArray(session.years) && session.years.length > 2) {
    return session.years.join(' > ');
  }
  return session.yearA + ' to ' + session.yearB;
}

function maskText(session) {
  const timeline = session.timeline;
  if (Array.isArray(timeline) && timeline.length) {
    const values = timeline
      .map((scene) => scene.stats && scene.stats.mask && scene.stats.mask.applied ? scene.stats.mask.maskedPercent : NaN)
      .filter((value) => Number.isFinite(value));
    if (values.length) {
      const average = values.reduce((sum, value) => sum + value, 0) / values.length;
      return 'SCL mask averaged ' + shortNumber(average) + '% masked pixels';
    }
  }
  const mask = session.stats && session.stats.mask && session.stats.mask.before;
  return mask && mask.applied
    ? 'SCL mask removed ' + shortNumber(mask.maskedPercent) + '% of pixels'
    : 'no per-pixel mask in this saved run';
}

function modelText(session) {
  const timeline = session.timeline;
  if (Array.isArray(timeline) && timeline.length) {
    const models = timeline
      .map((scene) => scene.stats && scene.stats.model ? scene.stats.model : null)
      .filter(Boolean);
    if (models.length) {
      return 'WorldCover-assisted agreement ' + shortNumber(models[models.length - 1].agreementPercent) + '% on the last scene';
    }
  }
  const model = session.stats && session.stats.model && session.stats.model.after;
  return model ? 'WorldCover-assisted agreement ' + shortNumber(model.agreementPercent) + '%' : 'no WorldCover-assisted model in this saved run';
}

function contextLabel() {
  const session = readSession();
  if (!session) {
    return 'No analysis in this tab yet - general questions welcome.';
  }
  const comparison = session.stats && session.stats.comparison;
  return (
    'Context: ' + session.area + ' - ' + periodText(session) + ' - ' + session.season +
      (comparison ? ' - ' + shortNumber(comparison.changedPercent) + '% changed' : '')
  );
}

function analysisContext() {
  const session = readSession();
  if (!session) {
    return 'No analysis has been run in this browser tab yet. You can still explain the project and answer general questions.';
  }

  const before = session.scenes.before;
  const after = session.scenes.after;
  const comparison = session.stats && session.stats.comparison;
  const timeline = session.timeline;
  const parts = [
    'Current analysis context:',
    'area ' + session.area,
    'bounding box ' + session.bbox.map((value) => Number(value).toFixed(3)).join(', '),
    'years ' + periodText(session),
    'season ' + session.season,
    'scene dates ' + before.date + ' and ' + after.date,
    'metadata cloud cover ' + Number(before.cloud).toFixed(1) + '% and ' + Number(after.cloud).toFixed(1) + '%',
    'candidate scenes ' + (session.counts ? session.counts.before : 0) + ' and ' + (session.counts ? session.counts.after : 0)
  ];

  if (Array.isArray(timeline) && timeline.length > 2) {
    parts.push('timeline of ' + timeline.length + ' same-season scenes');
    parts.push('timeline scene IDs ' + timeline.map((scene) => scene.id).join(', '));
  }

  if (comparison) {
    parts.push('estimated vegetation ' + shortNumber(comparison.percentagesBefore.vegetation) + '% to ' + shortNumber(comparison.percentagesAfter.vegetation) + '%');
    parts.push('estimated water ' + shortNumber(comparison.percentagesBefore.water) + '% to ' + shortNumber(comparison.percentagesAfter.water) + '%');
    parts.push('estimated hard surface ' + shortNumber(comparison.percentagesBefore.built) + '% to ' + shortNumber(comparison.percentagesAfter.built) + '%');
    parts.push('changed pixels ' + shortNumber(comparison.changedPercent) + '%');
    parts.push('sample coverage ' + shortNumber(comparison.coveragePercent) + '%');
    if (session.stats.before.meanNdvi && session.stats.after.meanNdvi) {
      parts.push('mean NDVI delta ' + signed(session.stats.after.meanNdvi - session.stats.before.meanNdvi, 3));
    }
    if (session.stats.modelComparison) {
      parts.push('WorldCover-assisted vegetation ' + shortNumber(session.stats.modelComparison.percentagesBefore.vegetation) + '% to ' + shortNumber(session.stats.modelComparison.percentagesAfter.vegetation) + '%');
    }
  } else {
    parts.push('pixel statistics are not available for this saved run');
  }

  parts.push(maskText(session));
  parts.push(modelText(session));
  const warnings = session.stats && session.stats.trend && session.stats.trend.earlyWarning;
  if (warnings && warnings.length) {
    parts.push('trend warnings ' + warnings.join(' '));
  }
  parts.push('The WorldCover model uses 2021 labels and is not independent ground truth.');
  parts.push('Do not invent any land-cover percentages, scene details or confirmed classifications.');
  return parts.join('; ');
}

function contentToString(content) {
  if (typeof content === 'string') {
    return content.trim();
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => (part && (part.text || part.content) ? String(part.text || part.content) : ''))
      .join('\n')
      .trim();
  }
  return '';
}

function localAnswer(question) {
  const q = question.toLowerCase();
  const session = readSession();
  const comparison = session && session.stats && session.stats.comparison;
  const prefix = navigator.onLine === false
    ? 'The live AI service is offline right now, so here is a local answer. '
    : 'The live AI service is busy right now, so here is a local answer. ';

  if (session && comparison && /(change|percent|how much|result|detect|class|vegetation|water|built)/.test(q)) {
    return prefix +
      'The sample suggests ' + shortNumber(comparison.changedPercent) + '% of comparable pixels changed class. ' +
      'Vegetation moved from ' + shortNumber(comparison.percentagesBefore.vegetation) + '% to ' + shortNumber(comparison.percentagesAfter.vegetation) +
      '%, water from ' + shortNumber(comparison.percentagesBefore.water) + '% to ' + shortNumber(comparison.percentagesAfter.water) +
      '%, and hard surface from ' + shortNumber(comparison.percentagesBefore.built) + '% to ' + shortNumber(comparison.percentagesAfter.built) +
      '%. These are spectral-index estimates, not a validated land-cover map.';
  }

  if (session && /(timeline|trend|year)/.test(q)) {
    const years = Array.isArray(session.years) ? session.years.join(', ') : session.yearA + ', ' + session.yearB;
    const warnings = session.stats && session.stats.trend && session.stats.trend.earlyWarning;
    return prefix + 'The saved timeline uses ' + years + ' in the ' + session.season + ' window' +
      (warnings && warnings.length ? '. Trend warning: ' + warnings[0] : '. No repeated direction was flagged across every interval') + '.';
  }

  if (session && /(model|worldcover|agreement|assisted)/.test(q)) {
    return prefix + modelText(session) + '. The model is trained in the browser from ESA WorldCover 2021 labels, so its agreement is an in-sample calibration check, not independent validation.';
  }

  if (session && /(export|download|report file)/.test(q)) {
    return prefix + 'Open the report and use Download report. It saves a self-contained HTML file with the evidence tables, findings, two actions and limits. No server is involved.';
  }

  if (session && /(this|my|analysis|area|place|date|scene|cloud|next|brief)/.test(q)) {
    if (/(cloud|quality|mask|shadow)/.test(q)) {
      return prefix + 'Metadata cloud cover is ' + Number(session.scenes.before.cloud).toFixed(1) + '% for Before and ' +
        Number(session.scenes.after.cloud).toFixed(1) + '% for After. ' + maskText(session) +
        '. Thin cloud and shadows can still remain, so inspect the imagery visually.';
    }
    if (/(date|year|when|period)/.test(q)) {
      return prefix + 'The comparison uses ' + periodText(session) + ', season window ' + session.season +
        '. The chosen scene dates are ' + session.scenes.before.date + ' and ' + session.scenes.after.date + '.';
    }
    if (/(scene|sentinel|satellite|image)/.test(q)) {
      return prefix + 'Before: ' + session.scenes.before.id + '. After: ' + session.scenes.after.id + '. Both come from the Sentinel-2 L2A collection.';
    }
    return prefix + 'The analysis covers ' + session.area + ' over ' + periodText(session) +
      '. Open the report for the evidence table, class estimates, two actions and limits.';
  }

  if (/(ndvi|vegetation|green|index|ndwi|ndbi)/.test(q)) {
    return prefix + 'NDVI compares near-infrared and red light to estimate green vegetation. NDWI uses green and near-infrared for water, while NDBI uses short-wave and near-infrared for hard surfaces. In Eco Watch they are screening signals, not a confirmed classification.';
  }
  if (/(eco watch|project|app|sentinel|satellite|how)/.test(q)) {
    return prefix + 'Eco Watch finds Sentinel-2 scenes for two dates or a 3 to 5 year timeline, masks invalid pixels with SCL, reads real pixel values for three spectral indices, trains a WorldCover-assisted classifier in the browser, and builds a decision brief with a downloadable report file. Everything starts from free public data.';
  }
  if (/(hello|hi|hey)/.test(q)) {
    return prefix + 'Hello. I can explain NDVI, Sentinel-2, the change estimates, the report, or the current analysis. What would you like to unpack?';
  }
  return prefix + 'I can help with environmental data, satellite imagery, spectral indices, the report structure, or the current analysis. Try asking a specific question and I will give you a direct explanation.';
}

export default function ChatAssistant() {
  const [open, setOpen] = useState(() => !isMobile());
  const [size, setSize] = useState(readStoredSize);
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('Live assistant - ask anything');
  const [context, setContext] = useState(contextLabel);
  const [messages, setMessages] = useState([
    {
      kind: 'bot',
      text: 'Hi. I am the Eco Watch AI assistant. Ask me about satellites, spectral indices, this analysis, or anything else you are working through.'
    }
  ]);

  const inputRef = useRef(null);
  const logRef = useRef(null);
  const historyRef = useRef([]);
  const preferredRef = useRef(0);
  const sourcesRef = useRef(AI_SOURCES.map((source) => ({ ...source })));

  useEffect(() => {
    const update = () => setContext(contextLabel());
    update();
    return subscribeToSession(update);
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty('--ai-panel-w', size.width + 'px');
    document.documentElement.style.setProperty('--ai-panel-h', size.height + 'px');
    document.body.classList.toggle('ai-chat-open', open);
    const frame = requestAnimationFrame(() => window.dispatchEvent(new Event('eco-watch-chat-resize')));
    const settled = setTimeout(() => window.dispatchEvent(new Event('eco-watch-chat-resize')), 220);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(settled);
      document.body.classList.remove('ai-chat-open');
      window.dispatchEvent(new Event('eco-watch-chat-resize'));
    };
  }, [open, size]);

  useEffect(() => {
    try {
      localStorage.setItem(CHAT_SIZE_KEY, JSON.stringify(size));
    } catch (error) {
      // Storage is optional; the panel still works without it.
    }
  }, [size]);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [messages, open]);

  async function askLive(payload) {
    let lastError = null;
    const sources = sourcesRef.current;
    const first = sources[preferredRef.current] || sources[0];
    const ordered = [first].concat(sources.filter((source) => source !== first));

    for (const source of ordered) {
      if (Date.now() < source.cooldownUntil) {
        continue;
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 22000);
      try {
        const response = await fetch(source.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: source.model,
            messages: payload,
            temperature: 0.5,
            max_tokens: 240
          }),
          signal: controller.signal
        });
        if (!response.ok) {
          const error = new Error('HTTP ' + response.status);
          error.status = response.status;
          throw error;
        }
        const data = await response.json();
        const choice = data && data.choices && data.choices[0];
        const text = contentToString(choice && choice.message ? choice.message.content : '');
        if (!text || hasNonLatin(text)) {
          throw new Error('Empty or non-English AI response');
        }
        preferredRef.current = sources.indexOf(source);
        return { text, source: source.name };
      } catch (error) {
        lastError = error;
        if (error && error.status === 429) {
          source.cooldownUntil = Date.now() + 30000;
          preferredRef.current = (sources.indexOf(source) + 1) % sources.length;
        }
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastError || new Error('No AI service available');
  }

  async function ask(question) {
    const clean = question.trim();
    if (!clean || busy) {
      return;
    }

    setMessages((current) => current.concat([
      { kind: 'user', text: clean },
      { kind: 'typing', text: 'Thinking...' }
    ]));
    setBusy(true);
    setStatus('Live assistant - thinking');

    const payload = [
      { role: 'system', content: SYSTEM_PROMPT + ' ' + analysisContext() }
    ].concat(historyRef.current, [{ role: 'user', content: clean }]);

    try {
      const result = await askLive(payload);
      setMessages((current) => current.filter((item) => item.kind !== 'typing').concat({ kind: 'bot', text: result.text }));
      historyRef.current = historyRef.current.concat([
        { role: 'user', content: clean },
        { role: 'assistant', content: result.text }
      ]).slice(-10);
      setStatus('Live AI - ' + result.source);
    } catch (error) {
      setMessages((current) => current.filter((item) => item.kind !== 'typing').concat({ kind: 'bot', text: localAnswer(clean) }));
      setStatus('Local answer - live AI busy');
    } finally {
      setBusy(false);
    }
  }

  function handleSubmit(event) {
    event.preventDefault();
    if (!inputRef.current) {
      return;
    }
    const value = inputRef.current.value;
    inputRef.current.value = '';
    ask(value);
  }

  function toggleExpand() {
    if (isMobile()) {
      const nextHeight = expanded ? DEFAULT_SIZE.height : Math.min(window.innerHeight - 100, 680);
      setSize((current) => ({ ...current, height: nextHeight }));
    } else {
      const nextWidth = expanded ? DEFAULT_SIZE.width : Math.min(500, Math.max(320, window.innerWidth - 460));
      setSize((current) => ({ ...current, width: nextWidth }));
    }
    setExpanded(!expanded);
  }

  function startResize(event, axis) {
    event.preventDefault();
    const mobile = isMobile() || axis === 'y';
    const start = { x: event.clientX, y: event.clientY, width: size.width, height: size.height };

    const onMove = (moveEvent) => {
      if (mobile) {
        const nextHeight = clamp(start.height + (start.y - moveEvent.clientY), 300, window.innerHeight - 100);
        setSize((current) => ({ ...current, height: nextHeight }));
      } else {
        const maxWidth = Math.min(520, Math.max(320, window.innerWidth - 460));
        const nextWidth = clamp(start.width + (start.x - moveEvent.clientX), 300, maxWidth);
        setSize((current) => ({ ...current, width: nextWidth }));
      }
      setExpanded(false);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  return (
    <div className="ai-chat" data-open={open ? 'true' : 'false'}>
      <div className="ai-dock" aria-hidden="true" />
      <button
        className="ai-fab"
        id="ai-fab"
        type="button"
        aria-label={open ? 'Close AI assistant' : 'Open AI assistant'}
        aria-expanded={open ? 'true' : 'false'}
        onClick={() => setOpen(!open)}
      >
        <span className="ai-fab-icon" aria-hidden="true">{open ? '×' : 'AI'}</span>
        <span className="ai-fab-label">Ask AI</span>
      </button>

      <section className="ai-panel" id="ai-panel" aria-label="Eco Watch AI assistant" style={{ width: size.width, height: size.height }}>
        <header className="ai-panel-head">
          <span className="ai-avatar" aria-hidden="true">AI</span>
          <span className="ai-head-copy">
            <b>Eco Watch AI</b>
            <small id="ai-status">{status}</small>
          </span>
          <button className="ai-icon-btn" type="button" aria-label={expanded ? 'Restore assistant size' : 'Expand assistant'} onClick={toggleExpand}>
            {expanded ? '↙' : '⤢'}
          </button>
          <button className="ai-icon-btn" type="button" aria-label="Close AI assistant" onClick={() => setOpen(false)}>
            ×
          </button>
        </header>

        <div className="ai-resize ai-resize-x" onPointerDown={(event) => startResize(event, 'x')} aria-hidden="true" />
        <div className="ai-resize ai-resize-y" onPointerDown={(event) => startResize(event, 'y')} aria-hidden="true" />

        <p className="ai-context">{context}</p>
        <div className="ai-log" ref={logRef} aria-live="polite">
          {messages.map((message, index) => (
            <div className={'ai-bubble ' + message.kind} key={index}>{message.text}</div>
          ))}
        </div>
        <div className="ai-presets">
          <button type="button" onClick={() => ask('What is NDVI?')}>What is NDVI?</button>
          <button type="button" onClick={() => ask('Explain this analysis')}>Explain this analysis</button>
          <button type="button" onClick={() => ask('Explain the timeline')}>Explain the timeline</button>
        </div>
        <form className="ai-form" onSubmit={handleSubmit}>
          <input ref={inputRef} type="text" placeholder={busy ? 'Thinking...' : 'Ask anything...'} aria-label="Message the AI assistant" autoComplete="off" disabled={busy} />
          <button type="submit" disabled={busy}>Send</button>
        </form>
        <p className="ai-footnote">Public AI service - avoid sensitive data.</p>
      </section>
    </div>
  );
}
