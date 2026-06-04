import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, 
  Pause, 
  RefreshCw, 
  Sliders, 
  Layers, 
  TrendingUp, 
  Gauge, 
  Users, 
  AlertTriangle, 
  Clock, 
  Info,
  Car,
  ShoppingBag,
  CreditCard,
  CheckCircle,
  HelpCircle
} from 'lucide-react';
import { DriveThruSimulation, SLOTS } from './simulation';

function App() {
  // Simulation Params State
  const [params, setParams] = useState({
    arrivalRate: 1.5,        // cars/minute
    orderServiceRate: 2.0,   // cars/minute
    payServiceRate: 3.0,     // cars/minute
    pickupServiceRate: 1.8,  // cars/minute
    windowMode: 'dual',      // 'single' or 'dual'
    maxQueueCapacity: 10
  });

  const [isRunning, setIsRunning] = useState(true);
  const [speedMultiplier, setSpeedMultiplier] = useState(2); // default 2x speed for better viewing
  const [metrics, setMetrics] = useState({
    simTime: 0,
    servedCount: 0,
    balkedCount: 0,
    activeQueueLength: 0,
    maxQueueLength: 0,
    avgWaitingTime: 0,
    avgSystemTime: 0,
    orderUtilization: 0,
    payUtilization: 0,
    pickupUtilization: 0,
    bottleneck: 'None'
  });
  const [history, setHistory] = useState([]);

  // Refs for animation and canvas
  const canvasRef = useRef(null);
  const simRef = useRef(null);
  const animationFrameIdRef = useRef(null);
  const lastTimeRef = useRef(null);

  // Initialize simulation on mount
  if (!simRef.current) {
    simRef.current = new DriveThruSimulation(params);
  }

  // Update simulation parameters when state changes
  useEffect(() => {
    if (simRef.current) {
      simRef.current.updateParams(params);
    }
  }, [params]);

  // Animation and stepping loop
  useEffect(() => {
    const loop = (timestamp) => {
      if (!lastTimeRef.current) {
        lastTimeRef.current = timestamp;
      }
      
      const elapsedRealSeconds = (timestamp - lastTimeRef.current) / 1000;
      lastTimeRef.current = timestamp;

      if (isRunning && simRef.current) {
        // Convert real elapsed time to simulation minutes:
        // 1 real second = 0.5 simulation minutes at 1x speed (speed is halved for better viewing)
        const dtSim = elapsedRealSeconds * speedMultiplier * 0.5;
        
        // Take multiple small sub-steps for numerical stability at high speed
        const maxStepSize = 0.05;
        let remaining = dtSim;
        while (remaining > 0) {
          const stepSize = Math.min(remaining, maxStepSize);
          simRef.current.step(stepSize);
          remaining -= stepSize;
        }
        
        // Update states for dashboard
        setMetrics(simRef.current.getMetrics());
        setHistory([...simRef.current.stats.history]);
      } else {
        // Just draw current state if paused
        if (simRef.current) {
          setMetrics(simRef.current.getMetrics());
        }
      }

      // Draw canvas
      draw();
      
      animationFrameIdRef.current = requestAnimationFrame(loop);
    };

    lastTimeRef.current = null;
    animationFrameIdRef.current = requestAnimationFrame(loop);

    return () => {
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
      }
    };
  }, [isRunning, speedMultiplier]);

  // Reset handler
  const handleReset = () => {
    if (simRef.current) {
      simRef.current.reset();
      setMetrics(simRef.current.getMetrics());
      setHistory([]);
    }
  };

  // Run a quick pre-built scenario
  const loadScenario = (type) => {
    handleReset();
    if (type === 'rush-hour') {
      setParams({
        arrivalRate: 3.2,
        orderServiceRate: 2.0,
        payServiceRate: 3.0,
        pickupServiceRate: 1.8,
        windowMode: 'dual',
        maxQueueCapacity: 12
      });
      setSpeedMultiplier(10); // Speed up to observe queue buildup
    } else if (type === 'optimized-dual') {
      setParams({
        arrivalRate: 2.5,
        orderServiceRate: 3.5, // fast ordering
        payServiceRate: 4.5,   // fast contactless payment
        pickupServiceRate: 3.0, // efficient food preparation
        windowMode: 'dual',
        maxQueueCapacity: 12
      });
    } else if (type === 'single-slow') {
      setParams({
        arrivalRate: 1.8,
        orderServiceRate: 2.2,
        payServiceRate: 3.0,
        pickupServiceRate: 2.0,
        windowMode: 'single',
        maxQueueCapacity: 10
      });
    }
  };

  // Canvas Drawing Logic
  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    // Clear canvas
    ctx.fillStyle = '#11131e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw background grids (Decorative)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.02)';
    ctx.lineWidth = 1;
    const gridSize = 40;
    for (let x = 0; x < canvas.width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    // 1. DRAW ROAD BORDERS (Outline)
    ctx.strokeStyle = '#2b2f4a';
    ctx.lineWidth = 48; // 2px border on each side (44 + 4)
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(SLOTS[0].x, SLOTS[0].y + 50);
    SLOTS.forEach(slot => {
      ctx.lineTo(slot.x, slot.y);
    });
    ctx.stroke();

    // 2. DRAW THE ROAD ASPHALT
    ctx.strokeStyle = '#1f2235';
    ctx.lineWidth = 44;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(SLOTS[0].x, SLOTS[0].y + 50);
    SLOTS.forEach(slot => {
      ctx.lineTo(slot.x, slot.y);
    });
    ctx.stroke();

    // 3. DRAW ROAD MARKINGS (yellow dashed lines in center)
    ctx.strokeStyle = 'rgba(234, 179, 8, 0.15)';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 8]);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(SLOTS[0].x, SLOTS[0].y + 50);
    SLOTS.forEach(slot => {
      ctx.lineTo(slot.x, slot.y);
    });
    ctx.stroke();
    ctx.setLineDash([]); // Reset dash

    // DRAW STATIONS (Buildings / Windows)
    
    // Station 1: Order Post (Slot 4)
    const isOrderBusy = simRef.current?.cars.some(c => c.currentSlot === 4 && c.state === 'ordering');
    ctx.fillStyle = isOrderBusy ? 'rgba(239, 68, 68, 0.2)' : 'rgba(74, 222, 128, 0.15)';
    ctx.strokeStyle = isOrderBusy ? '#ef4444' : '#4ade80';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(SLOTS[4].x + 40, SLOTS[4].y, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Speaker post visual label
    ctx.fillStyle = '#ffffff';
    ctx.font = "bold 9px 'Outfit', system-ui, -apple-system, sans-serif";
    ctx.textAlign = 'center';
    ctx.fillText('ORDER', SLOTS[4].x + 40, SLOTS[4].y - 2);
    ctx.font = "500 8px 'JetBrains Mono', monospace";
    ctx.fillStyle = isOrderBusy ? '#f87171' : '#a7f3d0';
    ctx.fillText(isOrderBusy ? 'BUSY' : 'IDLE', SLOTS[4].x + 40, SLOTS[4].y + 8);

    // Station 2: Payment Window (Slot 7)
    if (simRef.current?.windowMode === 'dual') {
      const isPayBusy = simRef.current?.cars.some(c => c.currentSlot === 7 && c.state === 'paying');
      // Draw building window box at top (84px wide, 36px tall, rounded corners)
      ctx.fillStyle = isPayBusy ? 'rgba(239, 68, 68, 0.25)' : 'rgba(74, 222, 128, 0.15)';
      ctx.strokeStyle = isPayBusy ? '#ef4444' : '#4ade80';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(SLOTS[7].x - 42, SLOTS[7].y - 61, 84, 36, 4);
      ctx.fill();
      ctx.stroke();
      // text
      ctx.fillStyle = '#ffffff';
      ctx.font = "bold 9px 'Outfit', system-ui, -apple-system, sans-serif";
      ctx.textAlign = 'center';
      ctx.fillText('PAYMENT', SLOTS[7].x, SLOTS[7].y - 47);
      ctx.font = "500 8px 'JetBrains Mono', monospace";
      ctx.fillStyle = isPayBusy ? '#f87171' : '#a7f3d0';
      ctx.fillText(isPayBusy ? 'SERVING' : 'IDLE', SLOTS[7].x, SLOTS[7].y - 34);
    } else {
      // payment window grayed out / disabled
      ctx.fillStyle = '#1e2030';
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(SLOTS[7].x - 42, SLOTS[7].y - 61, 84, 36, 4);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#6b7280';
      ctx.font = "bold 9px 'Outfit', system-ui, -apple-system, sans-serif";
      ctx.textAlign = 'center';
      ctx.fillText('BYPASSED', SLOTS[7].x, SLOTS[7].y - 40);
    }

    // Station 3: Pickup Window (Slot 10)
    const isPickupBusy = simRef.current?.cars.some(c => 
      c.currentSlot === 10 && (c.state === 'picking_up' || c.state === 'paying')
    );
    ctx.fillStyle = isPickupBusy ? 'rgba(239, 68, 68, 0.25)' : 'rgba(74, 222, 128, 0.15)';
    ctx.strokeStyle = isPickupBusy ? '#ef4444' : '#4ade80';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(SLOTS[10].x - 47, SLOTS[10].y - 61, 94, 36, 4);
    ctx.fill();
    ctx.stroke();
    // text
    ctx.fillStyle = '#ffffff';
    ctx.font = "bold 9px 'Outfit', system-ui, -apple-system, sans-serif";
    ctx.textAlign = 'center';
    ctx.fillText(simRef.current?.windowMode === 'single' ? 'PAY & PICKUP' : 'PICKUP WINDOW', SLOTS[10].x, SLOTS[10].y - 47);
    ctx.font = "500 8px 'JetBrains Mono', monospace";
    ctx.fillStyle = isPickupBusy ? '#f87171' : '#a7f3d0';
    ctx.fillText(isPickupBusy ? 'PREPARING' : 'READY', SLOTS[10].x, SLOTS[10].y - 34);

    // DRAW SLOT INFO / CAPACITIES
    // Show queue counts
    const activeCars = simRef.current?.cars || [];
    const orderQueueCount = activeCars.filter(c => c.currentSlot >= 0 && c.currentSlot < 4).length;
    
    ctx.fillStyle = '#9ca3af';
    ctx.font = "10px 'JetBrains Mono', monospace";
    ctx.textAlign = 'left';
    ctx.fillText(`Driveway Queue: ${orderQueueCount}/${simRef.current?.maxQueueCapacity}`, 20, 25);
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    // draw dots on the slots
    SLOTS.forEach(slot => {
      if (slot.label) {
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.beginPath();
        ctx.arc(slot.x, slot.y, 4, 0, Math.PI*2);
        ctx.fill();
      }
    });

    // DRAW CARS
    activeCars.forEach(car => {
      // Calculate rotation angle based on simulation angle or fall back to position-based calculation
      let angle;
      if (car.angle !== undefined) {
        angle = car.angle;
      } else {
        let targetX, targetY;
        if (car.currentSlot === -1) {
          targetX = SLOTS[0].x;
          targetY = SLOTS[0].y + 50;
        } else {
          const slot = SLOTS[car.currentSlot];
          targetX = slot.x;
          targetY = slot.y;
        }
        const mdx = targetX - car.x;
        const mdy = targetY - car.y;
        const moveDist = Math.sqrt(mdx * mdx + mdy * mdy);
        
        if (moveDist > 2) {
          // Car is still moving — face the direction of travel
          angle = Math.atan2(mdy, mdx);
        } else {
          // Car has arrived at slot — face based on slot segment direction
          if (car.currentSlot >= 0 && car.currentSlot <= 4) {
            angle = -Math.PI / 2; // facing up
          } else if (car.currentSlot >= 6 && car.currentSlot <= 10) {
            angle = 0; // facing right
          } else if (car.currentSlot >= 13) {
            angle = Math.PI / 2; // facing down
          } else if (car.currentSlot === 5) {
            angle = -Math.PI / 4;
          } else if (car.currentSlot === 11) {
            angle = Math.PI / 6;
          } else if (car.currentSlot === 12) {
            angle = Math.PI / 3;
          } else {
            angle = 0;
          }
        }
      }

      ctx.save();
      ctx.translate(car.x, car.y);
      ctx.rotate(angle);

      // Draw car body shadow
      ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
      ctx.shadowBlur = 6;
      ctx.shadowOffsetY = 2;

      // Draw car wheels
      ctx.fillStyle = '#090a0f';
      ctx.fillRect(-12, -12, 6, 3);
      ctx.fillRect(8, -12, 6, 3);
      ctx.fillRect(-12, 9, 6, 3);
      ctx.fillRect(8, 9, 6, 3);

      // Draw car chassis
      ctx.shadowColor = 'transparent'; // Reset shadow for main chassis
      ctx.fillStyle = car.color;
      
      // Different shapes for compact, SUV, Sedan, Truck
      if (car.type === 'suv') {
        // SUV is bulkier
        ctx.beginPath();
        ctx.roundRect(-15, -10, 30, 20, 4);
        ctx.fill();
        // Windshield
        ctx.fillStyle = '#67e8f9';
        ctx.fillRect(0, -7, 5, 14);
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.fillRect(-10, -7, 8, 14); // sunroof/backwindow
      } else if (car.type === 'truck') {
        // Truck has a cargo bed
        ctx.beginPath();
        ctx.roundRect(-16, -10, 16, 20, 2); // cabin
        ctx.roundRect(0, -9, 16, 18, 1); // bed
        ctx.fill();
        ctx.fillStyle = '#1e293b'; // cargo bed interior
        ctx.fillRect(1, -7, 14, 14);
        // Windshield
        ctx.fillStyle = '#67e8f9';
        ctx.fillRect(-5, -7, 4, 14);
      } else {
        // Standard Sedan/Compact
        ctx.beginPath();
        ctx.roundRect(-14, -9, 28, 18, 5);
        ctx.fill();
        // Windshield
        ctx.fillStyle = '#67e8f9';
        ctx.fillRect(-2, -6, 5, 12);
      }

      // Windshield glossy reflection
      ctx.fillStyle = '#e0f7fa';
      ctx.fillRect(0, -5, 1, 4);

      // Draw headlights (facing forward)
      ctx.fillStyle = '#fef08a';
      ctx.beginPath();
      ctx.arc(13, -6, 2, 0, Math.PI * 2);
      ctx.arc(13, 6, 2, 0, Math.PI * 2);
      ctx.fill();

      // Glowing status circles above the car based on state
      let badgeColor = '#9ca3af'; // waiting
      if (car.state === 'ordering') badgeColor = '#eab308'; // ordering - yellow
      else if (car.state === 'paying') badgeColor = '#3b82f6'; // paying - blue
      else if (car.state === 'picking_up') badgeColor = '#a855f7'; // picking up - purple
      else if (car.state === 'pickup_finished' || car.state === 'departing') badgeColor = '#22c55e'; // done - green

      ctx.restore();

      // Render details (ID label and small status pill above car on canvas, un-rotated)
      ctx.fillStyle = '#ffffff';
      ctx.font = "bold 9px 'JetBrains Mono', monospace";
      ctx.textAlign = 'center';
      // Draw ID sticker on the roof of the car
      ctx.fillText(`#${car.id}`, car.x, car.y - 2);

      // Status indicator bubble
      ctx.fillStyle = badgeColor;
      ctx.beginPath();
      ctx.arc(car.x, car.y - 15, 3.5, 0, Math.PI*2);
      ctx.fill();
    });

    // Draw static environment structures (Lawn/trees, drive-thru pathway labels)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.font = "bold 16px 'Outfit', system-ui, -apple-system, sans-serif";
    ctx.textAlign = 'center';
    ctx.fillText('RESTAURANT DRIVE-THRU', canvas.width / 2, canvas.height - 25);
  };

  // Convert utilization to glowing color tags
  const getUtilColorClass = (val) => {
    if (val > 80) return 'text-red-400 border-red-500/30 bg-red-500/10';
    if (val > 50) return 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10';
    return 'text-green-400 border-green-500/30 bg-green-500/10';
  };

  // Generate path points for the SVG history charts (with 120 mins rolling window)
  const chartWidth = 600;
  const chartHeight = 150;
  const padding = 15;
  const maxHistoryPoints = 120;

  // 1. Queue Length Chart calculations
  const maxQueueVal = Math.max(...history.map(h => h.queueLength), params.maxQueueCapacity, 5);

  const queuePoints = history.map((h, i) => {
    // Grow from left to right with a fixed scale (mapped to maxHistoryPoints)
    const x = padding + (i / (maxHistoryPoints - 1)) * (chartWidth - 2 * padding);
    const y = chartHeight - padding - (h.queueLength / maxQueueVal) * (chartHeight - 2 * padding);
    return `${x},${y}`;
  }).join(' ');

  const queueAreaPoints = history.length > 0
    ? `${padding},${chartHeight - padding} ${queuePoints} ${padding + ((history.length - 1) / (maxHistoryPoints - 1)) * (chartWidth - 2 * padding)},${chartHeight - padding}`
    : '';

  // 2. Average Waiting Time Chart calculations
  const maxWaitVal = Math.max(...history.map(h => h.avgWaitingTime), 2.0); // minimum scale 2 mins

  const waitPoints = history.map((h, i) => {
    const x = padding + (i / (maxHistoryPoints - 1)) * (chartWidth - 2 * padding);
    const y = chartHeight - padding - (h.avgWaitingTime / maxWaitVal) * (chartHeight - 2 * padding);
    return `${x},${y}`;
  }).join(' ');

  const waitAreaPoints = history.length > 0
    ? `${padding},${chartHeight - padding} ${waitPoints} ${padding + ((history.length - 1) / (maxHistoryPoints - 1)) * (chartWidth - 2 * padding)},${chartHeight - padding}`
    : '';

  return (
    <div className="app-container">
      {/* Header Bar */}
      <div className="header-section">
        <div>
          <h1>Simulation Playground: Drive-Thru Queue</h1>
          <p className="sub-title-desc">
            Stochastic multi-stage queueing network simulation based on Queueing Theory
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="speed-badge">Sim Time: {metrics.simTime.toFixed(1)}m</div>
          <button className="btn btn-danger" onClick={handleReset}>
            <RefreshCw size={15} /> Reset
          </button>
        </div>
      </div>

      {/* Grid Dashboard */}
      <div className="grid-layout">
        
        {/* Panel Kiri: Slider Parameter */}
        <div className="glass-panel left-panel">
          <h2>
            <Sliders size={20} className="text-purple-400" />
            Input Parameters
          </h2>

          <div className="control-group">
            <div className="control-label">
              <span>Window Configuration</span>
              <span className="value">{params.windowMode.toUpperCase()} WINDOW</span>
            </div>
            <div className="toggle-container">
              <button 
                className={`toggle-btn ${params.windowMode === 'dual' ? 'active' : ''}`}
                onClick={() => setParams({ ...params, windowMode: 'dual' })}
              >
                Dual Window (Order-Pay-Pickup)
              </button>
              <button 
                className={`toggle-btn ${params.windowMode === 'single' ? 'active' : ''}`}
                onClick={() => setParams({ ...params, windowMode: 'single' })}
              >
                Single Window (Order-Combine)
              </button>
            </div>
          </div>

          <div className="control-group">
            <div className="control-label">
              <span>Arrival Rate (&lambda;)</span>
              <span className="value">{params.arrivalRate.toFixed(1)} cars/min</span>
            </div>
            <input 
              type="range" 
              min="0.5" 
              max="6.0" 
              step="0.1" 
              value={params.arrivalRate}
              onChange={(e) => setParams({ ...params, arrivalRate: parseFloat(e.target.value) })}
            />
            <span className="text-[10px] text-gray-500 font-mono">Poisson Distribution (Exponential inter-arrival)</span>
          </div>

          <div className="control-group">
            <div className="control-label">
              <span>Order Service Rate (&mu;<sub>order</sub>)</span>
              <span className="value">{params.orderServiceRate.toFixed(1)} cars/min</span>
            </div>
            <input 
              type="range" 
              min="0.5" 
              max="6.0" 
              step="0.1" 
              value={params.orderServiceRate}
              onChange={(e) => setParams({ ...params, orderServiceRate: parseFloat(e.target.value) })}
            />
            <span className="text-[10px] text-gray-500 font-mono">Exponential service duration</span>
          </div>

          {params.windowMode === 'dual' && (
            <div className="control-group">
              <div className="control-label">
                <span>Payment Service Rate (&mu;<sub>pay</sub>)</span>
                <span className="value">{params.payServiceRate.toFixed(1)} cars/min</span>
              </div>
              <input 
                type="range" 
                min="0.5" 
                max="6.0" 
                step="0.1" 
                value={params.payServiceRate}
                onChange={(e) => setParams({ ...params, payServiceRate: parseFloat(e.target.value) })}
              />
              <span className="text-[10px] text-gray-500 font-mono">Exponential payment duration</span>
            </div>
          )}

          <div className="control-group">
            <div className="control-label">
              <span>Food Preparation Rate (&mu;<sub>pickup</sub>)</span>
              <span className="value">{params.pickupServiceRate.toFixed(1)} cars/min</span>
            </div>
            <input 
              type="range" 
              min="0.5" 
              max="6.0" 
              step="0.1" 
              value={params.pickupServiceRate}
              onChange={(e) => setParams({ ...params, pickupServiceRate: parseFloat(e.target.value) })}
            />
            <span className="text-[10px] text-gray-500 font-mono">Lognormal preparation duration</span>
          </div>

          <div className="control-group">
            <div className="control-label">
              <span>Driveway Capacity (K)</span>
              <span className="value">{params.maxQueueCapacity} cars</span>
            </div>
            <input 
              type="range" 
              min="5" 
              max="15" 
              step="1" 
              value={params.maxQueueCapacity}
              onChange={(e) => setParams({ ...params, maxQueueCapacity: parseInt(e.target.value) })}
            />
            <span className="text-[10px] text-gray-500 font-mono">Sigmoid Balking: customers start leaving at &gt;50% full, rising sharply at 70%, and 100% at capacity</span>
          </div>

          <div className="experiment-card">
            <h3>Quick Presets (Experiments)</h3>
            <p className="experiment-text">Load presets to observe different queuing system characteristics.</p>
            <div className="flex flex-col gap-2">
              <button className="btn btn-sm text-xs py-1" onClick={() => loadScenario('rush-hour')}>
                🔥 Extreme Rush Hour
              </button>
              <button className="btn btn-sm text-xs py-1" onClick={() => loadScenario('optimized-dual')}>
                ⚡ Optimized Dual Window
              </button>
              <button className="btn btn-sm text-xs py-1" onClick={() => loadScenario('single-slow')}>
                🐌 Slow Single Window
              </button>
            </div>
          </div>
        </div>

        {/* Panel Tengah: Live Canvas & Speed Controls */}
        <div className="flex flex-col gap-5 center-panel">
          <div className="glass-panel canvas-wrapper">
            <canvas 
              ref={canvasRef} 
              width={650} 
              height={420} 
              className="canvas-element"
            />
            <div className="legend">
              <div className="legend-item">
                <div className="legend-color" style={{ background: '#9ca3af' }}></div>
                <span>Queueing</span>
              </div>
              <div className="legend-item">
                <div className="legend-color" style={{ background: '#eab308' }}></div>
                <span>Ordering</span>
              </div>
              {params.windowMode === 'dual' && (
                <div className="legend-item">
                  <div className="legend-color" style={{ background: '#3b82f6' }}></div>
                  <span>Paying</span>
                </div>
              )}
              <div className="legend-item">
                <div className="legend-color" style={{ background: '#a855f7' }}></div>
                <span>Pickup</span>
              </div>
              <div className="legend-item">
                <div className="legend-color" style={{ background: '#22c55e' }}></div>
                <span>Exit/Done</span>
              </div>
            </div>
          </div>

          {/* Speed Controls */}
          <div className="glass-panel">
            <h2>Simulation Run Controls</h2>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex gap-2">
                {isRunning ? (
                  <button className="btn btn-accent" onClick={() => setIsRunning(false)}>
                    <Pause size={16} /> Pause
                  </button>
                ) : (
                  <button className="btn btn-primary" onClick={() => setIsRunning(true)}>
                    <Play size={16} /> Play
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-400">Speed:</span>
                {[1, 2, 5, 15, 30].map(multiplier => (
                  <button 
                    key={multiplier}
                    className={`btn text-xs px-2.5 py-1 ${speedMultiplier === multiplier ? 'btn-primary' : ''}`}
                    onClick={() => setSpeedMultiplier(multiplier)}
                  >
                    {multiplier}x
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-3 text-xs text-gray-500 flex items-start gap-1">
              <Info size={12} className="mt-0.5 shrink-0 text-sky-400" />
              <span>
                Increasing simulation speed (15x - 30x) speeds up the simulation clock, filling performance charts on the right panel faster.
              </span>
            </div>
          </div>
        </div>

        {/* Panel Kanan: Statistik & Grafik Analitik */}
        <div className="glass-panel right-panel">
          <h2>
            <Gauge size={20} className="text-emerald-400" />
            Real-Time Statistics
          </h2>

          {/* Bottleneck indicator */}
          <div className={`bottleneck-box ${metrics.bottleneck !== 'None' ? 'alerting' : 'normal'}`}>
            <AlertTriangle size={24} className="shrink-0" />
            <div>
              <div className="font-bold text-xs uppercase tracking-wider">Bottleneck Identifier</div>
              <div className="font-semibold text-sm">
                {metrics.bottleneck !== 'None' ? `Bottleneck at ${metrics.bottleneck}` : 'System flows smoothly'}
              </div>
            </div>
          </div>

          <div className="stats-grid">
            <div className="stat-card">
              <span className="stat-header">Total Served</span>
              <span className="stat-val text-green-400">{metrics.servedCount}</span>
              <span className="stat-sub">Cars completed</span>
            </div>
            <div className="stat-card">
              <span className="stat-header">Balked (Bypassed)</span>
              <span className="stat-val text-red-400">{metrics.balkedCount}</span>
              <span className="stat-sub">Cars leaving queue</span>
            </div>
            <div className="stat-card">
              <span className="stat-header">Avg Waiting Time</span>
              <span className="stat-val text-yellow-400">{metrics.avgWaitingTime.toFixed(2)}m</span>
              <span className="stat-sub">Spent in queues</span>
            </div>
            <div className="stat-card">
              <span className="stat-header">Avg System Time</span>
              <span className="stat-val text-purple-400">{metrics.avgSystemTime.toFixed(2)}m</span>
              <span className="stat-sub">Total from entrance to exit</span>
            </div>
          </div>

          {/* Server Utilisation bars */}
          <div className="chart-container">
            <div className="chart-title">
              <span>Cashier / Window Utilization</span>
              <span className="text-sky-400 font-bold">% Time Busy</span>
            </div>
            <div className="flex flex-col gap-3 mt-2">
              <div>
                <div className="flex justify-between text-xs text-gray-400 mb-1 font-mono">
                  <span>Ordering Post</span>
                  <span className="font-bold text-gray-200">{metrics.orderUtilization.toFixed(0)}%</span>
                </div>
                <div className="w-full h-2.5 bg-gray-900 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-yellow-400 shadow-md shadow-yellow-400/20 transition-all duration-300"
                    style={{ width: `${Math.min(metrics.orderUtilization, 100)}%` }}
                  ></div>
                </div>
              </div>

              {params.windowMode === 'dual' && (
                <div>
                  <div className="flex justify-between text-xs text-gray-400 mb-1 font-mono">
                    <span>Payment Window</span>
                    <span className="font-bold text-gray-200">{metrics.payUtilization.toFixed(0)}%</span>
                  </div>
                  <div className="w-full h-2.5 bg-gray-900 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-blue-500 shadow-md shadow-blue-500/20 transition-all duration-300"
                      style={{ width: `${Math.min(metrics.payUtilization, 100)}%` }}
                    ></div>
                  </div>
                </div>
              )}

              <div>
                <div className="flex justify-between text-xs text-gray-400 mb-1 font-mono">
                  <span>{params.windowMode === 'single' ? 'Single Window (Pay & Pickup)' : 'Pickup Window'}</span>
                  <span className="font-bold text-gray-200">{metrics.pickupUtilization.toFixed(0)}%</span>
                </div>
                <div className="w-full h-2.5 bg-gray-900 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-purple-500 shadow-md shadow-purple-500/20 transition-all duration-300"
                    style={{ width: `${Math.min(metrics.pickupUtilization, 100)}%` }}
                  ></div>
                </div>
              </div>
            </div>
          </div>

          {/* Queue history line chart */}
          <div className="chart-container">
            <div className="chart-title">
              <span>Queue Length Trend (Last 120 Mins)</span>
              <span className="text-xs text-purple-400 font-mono">Current: {metrics.activeQueueLength}</span>
            </div>
            {history.length > 0 ? (
              <svg className="chart-svg" viewBox={`0 0 ${chartWidth} ${chartHeight}`}>
                <defs>
                  <linearGradient id="queueChartGlow" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.25"/>
                    <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.0"/>
                  </linearGradient>
                </defs>
                {/* Grid horizontal lines */}
                <line x1={padding} y1={padding} x2={chartWidth - padding} y2={padding} stroke="rgba(255,255,255,0.03)" />
                <line x1={padding} y1={chartHeight / 2} x2={chartWidth - padding} y2={chartHeight / 2} stroke="rgba(255,255,255,0.03)" />
                <line x1={padding} y1={chartHeight - padding} x2={chartWidth - padding} y2={chartHeight - padding} stroke="rgba(255,255,255,0.08)" strokeWidth={1} />
                
                {/* Capacity Threshold Line */}
                <line 
                  x1={padding} 
                  y1={chartHeight - padding - (params.maxQueueCapacity / maxQueueVal) * (chartHeight - 2 * padding)} 
                  x2={chartWidth - padding} 
                  y2={chartHeight - padding - (params.maxQueueCapacity / maxQueueVal) * (chartHeight - 2 * padding)} 
                  stroke="rgba(248, 113, 113, 0.4)" 
                  strokeWidth={1.5} 
                  strokeDasharray="4,4" 
                />
                <text 
                  x={padding + 5} 
                  y={chartHeight - padding - (params.maxQueueCapacity / maxQueueVal) * (chartHeight - 2 * padding) - 4} 
                  fill="#f87171" 
                  fontSize="9px" 
                  fontFamily="var(--mono)"
                >
                  Balking Threshold (Cap: {params.maxQueueCapacity})
                </text>

                {/* Area under the curve */}
                {queueAreaPoints && <polygon points={queueAreaPoints} fill="url(#queueChartGlow)" />}
                
                {/* Line Path */}
                {queuePoints && (
                  <path 
                    d={`M ${queuePoints.replace(/ /g, ' L ')}`} 
                    fill="none" 
                    stroke="var(--accent)" 
                    strokeWidth="2.5" 
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ filter: 'drop-shadow(0px 0px 4px rgba(56, 189, 248, 0.4))' }}
                  />
                )}
                
                {/* Y-axis Labels */}
                <text x={chartWidth - padding - 5} y={chartHeight - padding - 4} fill="rgba(255,255,255,0.3)" fontSize="8px" fontFamily="var(--mono)" textAnchor="end">0</text>
                <text x={chartWidth - padding - 5} y={padding + 10} fill="rgba(255,255,255,0.3)" fontSize="8px" fontFamily="var(--mono)" textAnchor="end">{maxQueueVal}</text>
              </svg>
            ) : (
              <div className="h-[120px] flex items-center justify-center text-xs text-gray-600 font-mono italic">
                Collecting queue data (runs on sim clock)...
              </div>
            )}
          </div>

          {/* Average Waiting Time Trend */}
          <div className="chart-container">
            <div className="chart-title">
              <span>Avg Waiting Time Trend (Last 120 Mins)</span>
              <span className="text-xs text-yellow-400 font-mono">Current: {metrics.avgWaitingTime.toFixed(2)}m</span>
            </div>
            {history.length > 0 ? (
              <svg className="chart-svg" viewBox={`0 0 ${chartWidth} ${chartHeight}`}>
                <defs>
                  <linearGradient id="waitChartGlow" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.25"/>
                    <stop offset="100%" stopColor="var(--primary)" stopOpacity="0.0"/>
                  </linearGradient>
                </defs>
                {/* Grid horizontal lines */}
                <line x1={padding} y1={padding} x2={chartWidth - padding} y2={padding} stroke="rgba(255,255,255,0.03)" />
                <line x1={padding} y1={chartHeight / 2} x2={chartWidth - padding} y2={chartHeight / 2} stroke="rgba(255,255,255,0.03)" />
                <line x1={padding} y1={chartHeight - padding} x2={chartWidth - padding} y2={chartHeight - padding} stroke="rgba(255,255,255,0.08)" strokeWidth={1} />
                
                {/* Area under the curve */}
                {waitAreaPoints && <polygon points={waitAreaPoints} fill="url(#waitChartGlow)" />}
                
                {/* Line Path */}
                {waitPoints && (
                  <path 
                    d={`M ${waitPoints.replace(/ /g, ' L ')}`} 
                    fill="none" 
                    stroke="var(--primary)" 
                    strokeWidth="2.5" 
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ filter: 'drop-shadow(0px 0px 4px rgba(192, 132, 252, 0.4))' }}
                  />
                )}
                
                {/* Y-axis Labels */}
                <text x={chartWidth - padding - 5} y={chartHeight - padding - 4} fill="rgba(255,255,255,0.3)" fontSize="8px" fontFamily="var(--mono)" textAnchor="end">0.0m</text>
                <text x={chartWidth - padding - 5} y={padding + 10} fill="rgba(255,255,255,0.3)" fontSize="8px" fontFamily="var(--mono)" textAnchor="end">{maxWaitVal.toFixed(1)}m</text>
              </svg>
            ) : (
              <div className="h-[120px] flex items-center justify-center text-xs text-gray-600 font-mono italic">
                Collecting waiting time data...
              </div>
            )}
          </div>
        </div>

      </div>
      
      <div className="footer">
        <p>Final Project: Stochastic Modeling & Simulation - Drive-Thru Queue</p>
        <p className="text-[11px] text-gray-600 mt-1">
          Built with React + HTML5 Canvas | Multi-Stage Queueing Model with Poisson & Lognormal Distributions
        </p>
      </div>
    </div>
  );
}

export default App;
