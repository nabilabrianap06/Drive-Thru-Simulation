// Simulation Engine for Drive-Thru Queue
// Implements discrete-event style simulation updated by time-steps.

// Box-Muller transform for generating normally distributed values
function getRandomNormal() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

// Generate exponential random variable
export function getRandomExponential(rate) {
  if (rate <= 0) return 0;
  return -Math.log(1 - Math.random()) / rate;
}

// Generate lognormal random variable given the real-scale mean and stdDev
export function getRandomLognormal(mean, stdDev) {
  if (mean <= 0) return 0;
  if (stdDev <= 0) stdDev = mean * 0.2; // default 20% variation
  const variance = stdDev * stdDev;
  const mu = Math.log((mean * mean) / Math.sqrt(mean * mean + variance));
  const sigma = Math.sqrt(Math.log(1.0 + variance / (mean * mean)));
  return Math.exp(mu + sigma * getRandomNormal());
}

// Visual layout slots representing the drive-thru lane
// 0: Entrance
// 1-3: Approach / Order Queue
// 4: Order Post
// 5-6: Transition to Pay
// 7: Payment Window
// 8-9: Transition to Pickup
// 10: Pickup Window
// 11-14: Departure path
export const SLOTS = [
  { id: 0, x: 45, y: 360, label: 'Entrance' },
  { id: 1, x: 45, y: 300 },
  { id: 2, x: 45, y: 250 },
  { id: 3, x: 45, y: 200 },
  { id: 4, x: 45, y: 150, label: 'Order Post' }, // Order Station
  { id: 5, x: 50, y: 95 },  // Corner 1
  { id: 6, x: 120, y: 70 },
  { id: 7, x: 200, y: 70, label: 'Pay Window' }, // Payment Station
  { id: 8, x: 280, y: 70 },
  { id: 9, x: 360, y: 70 },
  { id: 10, x: 440, y: 70, label: 'Pickup Window' }, // Pickup Station
  { id: 11, x: 520, y: 70 },
  { id: 12, x: 580, y: 110 }, // Corner 2
  { id: 13, x: 580, y: 190 },
  { id: 14, x: 580, y: 270 },
  { id: 15, x: 580, y: 360, label: 'Exit' }
];

const CAR_COLORS = [
  '#FF5733', '#33FF57', '#3357FF', '#F3FF33', '#FF33F3', 
  '#33FFF3', '#FFA833', '#AF33FF', '#33FF8A', '#FF3333'
];

const CAR_TYPES = ['sedan', 'suv', 'compact', 'truck'];

export class DriveThruSimulation {
  constructor(params = {}) {
    // Parameters (rates are per minute in simulation time)
    this.arrivalRate = params.arrivalRate || 1.5; // cars per minute
    this.orderServiceRate = params.orderServiceRate || 2.0; // cars per minute
    this.payServiceRate = params.payServiceRate || 3.0; // cars per minute
    this.pickupServiceRate = params.pickupServiceRate || 1.8; // cars per minute
    this.windowMode = params.windowMode || 'dual'; // 'single' or 'dual'
    this.maxQueueCapacity = params.maxQueueCapacity || 12; // cars before balking

    // State Variables
    this.simTime = 0; // current simulation time (minutes)
    this.cars = []; // all active cars in the system
    this.nextCarId = 1;

    // Statistics Tracker
    this.stats = {
      servedCount: 0,
      balkedCount: 0,
      totalWaitingTime: 0, // time spent in queues (order_queue, pay_queue, pickup_queue)
      totalSystemTime: 0, // total time from arrival to exit
      maxQueueLength: 0,
      orderBusyTime: 0,
      payBusyTime: 0,
      pickupBusyTime: 0,
      history: [] // record time series for graphs
    };

    // Keep track of last arrival time to schedule next arrival exactly
    this.nextArrivalTime = this.simTime + getRandomExponential(this.arrivalRate);
    this.lastHistoryRecordTime = 0;
    this.lastServedWaitingTimes = [];
  }

  updateParams(params) {
    if (params.arrivalRate !== undefined && params.arrivalRate !== this.arrivalRate) {
      this.arrivalRate = params.arrivalRate;
      // Reschedule next arrival with the new rate
      this.nextArrivalTime = this.simTime + getRandomExponential(this.arrivalRate);
    }
    if (params.orderServiceRate !== undefined) this.orderServiceRate = params.orderServiceRate;
    if (params.payServiceRate !== undefined) this.payServiceRate = params.payServiceRate;
    if (params.pickupServiceRate !== undefined) this.pickupServiceRate = params.pickupServiceRate;
    if (params.windowMode !== undefined) this.windowMode = params.windowMode;
    if (params.maxQueueCapacity !== undefined) this.maxQueueCapacity = params.maxQueueCapacity;
  }

  // Check if a slot is currently occupied by any car
  isSlotOccupied(slotId) {
    return this.cars.some(car => car.currentSlot === slotId);
  }

  // Get index of the car occupying a specific slot
  getCarInSlot(slotId) {
    return this.cars.find(car => car.currentSlot === slotId);
  }

  // Run a simulation step of duration dt (minutes)
  step(dt) {
    this.simTime += dt;

    // 1. Process server utilization statistics
    const orderCar = this.getCarInSlot(4);
    if (orderCar && orderCar.state === 'ordering') {
      this.stats.orderBusyTime += dt;
    }

    const payCar = this.getCarInSlot(7);
    if (payCar && payCar.state === 'paying' && this.windowMode === 'dual') {
      this.stats.payBusyTime += dt;
    }

    const pickupCar = this.getCarInSlot(10);
    if (pickupCar) {
      if (this.windowMode === 'dual' && pickupCar.state === 'picking_up') {
        this.stats.pickupBusyTime += dt;
      } else if (this.windowMode === 'single' && (pickupCar.state === 'paying' || pickupCar.state === 'picking_up')) {
        this.stats.pickupBusyTime += dt; // in single mode, pickup window does both
      }
    }

    // Update waiting times for all cars in queue states
    this.cars.forEach(car => {
      if (car.state === 'order_queue' || car.state === 'pay_queue' || car.state === 'pickup_queue') {
        car.waitingTime += dt;
      }
    });

    // 2. Handle New Arrivals
    if (this.simTime >= this.nextArrivalTime) {
      // Calculate current queue length (excluding cars that are departing)
      const currentQueueLength = this.cars.filter(c => c.currentSlot >= 0 && c.currentSlot <= 10).length;

      if (currentQueueLength >= this.maxQueueCapacity) {
        // Customer balks (leaves immediately)
        this.stats.balkedCount++;
      } else {
        // Calculate how many cars are currently waiting offscreen to initialize y-offset
        const offscreenCount = this.cars.filter(c => c.currentSlot === -1).length;

        // Create new car
        const newCar = {
          id: this.nextCarId++,
          color: CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)],
          type: CAR_TYPES[Math.floor(Math.random() * CAR_TYPES.length)],
          arrivalTime: this.simTime,
          waitingTime: 0,
          currentSlot: -1, // starts offscreen
          state: 'approaching',
          serviceTimes: {
            order: getRandomExponential(this.orderServiceRate),
            // Payment: exponential service
            pay: getRandomExponential(this.payServiceRate),
            // Pickup: lognormal service (more variation, representing food prep)
            pickup: getRandomLognormal(1 / this.pickupServiceRate, 0.25 * (1 / this.pickupServiceRate))
          },
          serviceRemaining: 0,
          // Positions for visual interpolation (spaced out offscreen)
          x: SLOTS[0].x,
          y: SLOTS[0].y + 50 + (offscreenCount * 40),
          progress: 0,
          lastVisitedSlot: -1,
          angle: -Math.PI / 2
        };
        this.cars.push(newCar);
      }

      // Schedule next arrival
      this.nextArrivalTime = this.simTime + getRandomExponential(this.arrivalRate);
    }

    // 3. Update state machine and slot movement for each car (from front of line to back to prevent locking)
    // We sort cars by current slot descending so the car closest to exit moves first, creating space for those behind it.
    this.cars.sort((a, b) => b.currentSlot - a.currentSlot);

    for (let i = 0; i < this.cars.length; i++) {
      const car = this.cars[i];

      // Handle movement from offscreen to Slot 0
      if (car.currentSlot === -1) {
        if (!this.isSlotOccupied(0)) {
          car.currentSlot = 0;
          car.state = 'order_queue';
        }
        continue;
      }

      // Handle station state machines when car is at a service slot
      if (car.currentSlot === 4) { // ORDER STATION
        if (car.state === 'order_queue') {
          car.state = 'ordering';
          car.serviceRemaining = car.serviceTimes.order;
        }
        if (car.state === 'ordering') {
          car.serviceRemaining -= dt;
          if (car.serviceRemaining <= 0) {
            car.state = 'order_finished';
          }
        }
        // Try to move to next slot if ordering finished
        if (car.state === 'order_finished' && !this.isSlotOccupied(5)) {
          car.currentSlot = 5;
          car.state = 'pay_queue';
        }
        continue;
      }

      if (car.currentSlot === 7) { // PAYMENT STATION (DUAL MODE ONLY)
        if (this.windowMode === 'dual') {
          if (car.state === 'pay_queue') {
            car.state = 'paying';
            car.serviceRemaining = car.serviceTimes.pay;
          }
          if (car.state === 'paying') {
            car.serviceRemaining -= dt;
            if (car.serviceRemaining <= 0) {
              car.state = 'pay_finished';
            }
          }
          // Try to move to Slot 8 if paid
          if (car.state === 'pay_finished' && !this.isSlotOccupied(8)) {
            car.currentSlot = 8;
            car.state = 'pickup_queue';
          }
        } else {
          // Single-window mode: payment slot is just a passage
          if (!this.isSlotOccupied(8)) {
            car.currentSlot = 8;
          }
        }
        continue;
      }

      if (car.currentSlot === 10) { // PICKUP STATION (AND PAYMENT IN SINGLE WINDOW)
        if (this.windowMode === 'dual') {
          if (car.state === 'pickup_queue') {
            car.state = 'picking_up';
            car.serviceRemaining = car.serviceTimes.pickup;
          }
          if (car.state === 'picking_up') {
            car.serviceRemaining -= dt;
            if (car.serviceRemaining <= 0) {
              car.state = 'pickup_finished';
            }
          }
        } else {
          // Single-window mode: payment + pickup happen here sequentially
          if (car.state === 'pay_queue') {
            car.state = 'paying';
            car.serviceRemaining = car.serviceTimes.pay;
          }
          if (car.state === 'paying') {
            car.serviceRemaining -= dt;
            if (car.serviceRemaining <= 0) {
              // After paying, transition to pickup phase (next step will start it)
              car.state = 'pickup_queue';
            }
          }
          // Separate the pickup phase so it doesn't start in the same tick as pay finishes
          if (car.state === 'pickup_queue' && car.serviceRemaining <= 0) {
            car.state = 'picking_up';
            car.serviceRemaining = car.serviceTimes.pickup;
          }
          if (car.state === 'picking_up') {
            car.serviceRemaining -= dt;
            if (car.serviceRemaining <= 0) {
              car.state = 'pickup_finished';
            }
          }
        }

        // Try to move to Slot 11 if pickup is finished
        if (car.state === 'pickup_finished' && !this.isSlotOccupied(11)) {
          car.currentSlot = 11;
          car.state = 'departing';
        }
        continue;
      }

      // Handle standard slot transitions (non-service slots)
      const nextSlot = car.currentSlot + 1;
      if (nextSlot < SLOTS.length) {
        if (!this.isSlotOccupied(nextSlot)) {
          // Special state transitions for passing normal slots
          if (nextSlot === 7 && this.windowMode === 'single') {
            // In single mode, passing pay window doesn't change queue state to pay queue
            car.currentSlot = nextSlot;
          } else if (nextSlot === 5) {
            car.state = 'pay_queue';
            car.currentSlot = nextSlot;
          } else if (nextSlot === 8 && this.windowMode === 'dual') {
            car.state = 'pickup_queue';
            car.currentSlot = nextSlot;
          } else if (nextSlot === 8 && this.windowMode === 'single') {
            // In single mode, Slot 8 is pay queue
            car.state = 'pay_queue';
            car.currentSlot = nextSlot;
          } else {
            car.currentSlot = nextSlot;
          }
        }
      } else {
        // Mark car for removal after the loop (don't mutate array while iterating)
        car._exited = true;
      }
    }

    // Remove exited cars and record their metrics
    const exitedCars = this.cars.filter(c => c._exited);
    exitedCars.forEach(car => {
      this.stats.servedCount++;
      this.stats.totalWaitingTime += car.waitingTime;
      this.stats.totalSystemTime += (this.simTime - car.arrivalTime);
      
      // Keep track of last 30 served cars for rolling average
      if (!this.lastServedWaitingTimes) {
        this.lastServedWaitingTimes = [];
      }
      this.lastServedWaitingTimes.push(car.waitingTime);
      if (this.lastServedWaitingTimes.length > 30) {
        this.lastServedWaitingTimes.shift();
      }
    });
    if (exitedCars.length > 0) {
      this.cars = this.cars.filter(c => !c._exited);
    }

    // 4. Update max queue length statistics
    const activeQueuedCars = this.cars.filter(c => 
      c.state === 'order_queue' || c.state === 'pay_queue' || c.state === 'pickup_queue' || 
      c.state === 'ordering' || c.state === 'paying' || c.state === 'picking_up'
    ).length;
    if (activeQueuedCars > this.stats.maxQueueLength) {
      this.stats.maxQueueLength = activeQueuedCars;
    }

    // 5. Update visual positions for rendering
    this.updateCarPositions(dt);

    // 6. Record history every 1.0 sim-minutes for charts
    if (this.simTime - this.lastHistoryRecordTime >= 1.0) {
      this.lastHistoryRecordTime = Math.floor(this.simTime);
      
      const activeQueue = this.cars.filter(c => c.currentSlot >= 0 && c.currentSlot <= 10).length;
      
      const orderUtil = this.simTime > 0 ? (this.stats.orderBusyTime / this.simTime) : 0;
      const payUtil = this.simTime > 0 ? (this.stats.payBusyTime / this.simTime) : 0;
      const pickupUtil = this.simTime > 0 ? (this.stats.pickupBusyTime / this.simTime) : 0;
      const avgWait = this.stats.servedCount > 0 ? (this.stats.totalWaitingTime / this.stats.servedCount) : 0;

      // Calculate rolling average of waiting time of last 30 served cars for a dynamic curve
      const rollingAvgWait = this.lastServedWaitingTimes && this.lastServedWaitingTimes.length > 0
        ? (this.lastServedWaitingTimes.reduce((a, b) => a + b, 0) / this.lastServedWaitingTimes.length)
        : avgWait;

      this.stats.history.push({
        time: this.lastHistoryRecordTime,
        queueLength: activeQueue,
        avgWaitingTime: rollingAvgWait,
        rawOrderBusy: this.stats.orderBusyTime,
        rawPayBusy: this.stats.payBusyTime,
        rawPickupBusy: this.stats.pickupBusyTime,
        orderUtilization: orderUtil,
        payUtilization: this.windowMode === 'dual' ? payUtil : 0,
        pickupUtilization: pickupUtil,
        served: this.stats.servedCount,
        balked: this.stats.balkedCount
      });

      // Cap history to last 120 minutes (2 hours window)
      if (this.stats.history.length > 120) {
        this.stats.history.shift();
      }
    }
  }

  // Smoothly interpolate car positions towards their slot coordinates
  updateCarPositions(dt) {
    const speed = 8.0; // speed of animation transition

    // Sort waiting cars by ID to maintain arrival order offscreen
    const waitingCars = this.cars.filter(c => c.currentSlot === -1).sort((a, b) => a.id - b.id);

    this.cars.forEach(car => {
      if (car.lastVisitedSlot === undefined) {
        car.lastVisitedSlot = -1;
      }
      if (car.angle === undefined) {
        car.angle = -Math.PI / 2;
      }

      let distRemaining = speed * dt * 60;

      // Keep moving along the slots sequence until we run out of movement distance
      for (let iter = 0; iter < 10; iter++) { // safety limit to prevent infinite loop
        if (distRemaining <= 0) break;

        let targetX, targetY;
        let targetSlotIndex = -1;

        if (car.currentSlot === -1) {
          const idx = waitingCars.findIndex(c => c.id === car.id);
          targetX = SLOTS[0].x;
          targetY = SLOTS[0].y + 50 + (idx >= 0 ? idx * 40 : 0);
        } else {
          targetSlotIndex = Math.min(car.currentSlot, car.lastVisitedSlot + 1);
          const slot = SLOTS[targetSlotIndex];
          targetX = slot.x;
          targetY = slot.y;
        }

        const dx = targetX - car.x;
        const dy = targetY - car.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > 0.1) {
          const moveStep = Math.min(dist, distRemaining);
          
          // Set angle based on movement direction
          car.angle = Math.atan2(dy, dx);
          
          car.x += (dx / dist) * moveStep;
          car.y += (dy / dist) * moveStep;
          distRemaining -= moveStep;

          // If we reached this slot, update lastVisitedSlot
          if (Math.abs(car.x - targetX) < 0.1 && Math.abs(car.y - targetY) < 0.1) {
            car.x = targetX;
            car.y = targetY;
            if (targetSlotIndex !== -1) {
              car.lastVisitedSlot = targetSlotIndex;
            }
          }
        } else {
          // Already virtually at the target slot
          car.x = targetX;
          car.y = targetY;
          if (targetSlotIndex !== -1) {
            car.lastVisitedSlot = targetSlotIndex;
          }
          
          // If we've reached the final currentSlot, we are done moving
          if (targetSlotIndex === car.currentSlot || car.currentSlot === -1) {
            break;
          }
        }
      }
    });
  }

  // Get aggregated dashboard metrics (rolling utilization for live response)
  getMetrics() {
    const activeQueueLength = this.cars.filter(c => c.currentSlot >= 0 && c.currentSlot <= 10).length;
    
    const avgWaitingTime = this.stats.servedCount > 0 
      ? (this.stats.totalWaitingTime / this.stats.servedCount) 
      : 0;
    
    const avgSystemTime = this.stats.servedCount > 0 
      ? (this.stats.totalSystemTime / this.stats.servedCount) 
      : 0;

    // Calculate rolling utilization over last 15 minutes of simulation time
    const windowSize = 15;
    let orderUtilization = 0;
    let payUtilization = 0;
    let pickupUtilization = 0;

    const history = this.stats.history;
    if (history.length >= 2) {
      const currentPoint = history[history.length - 1];
      const backIdx = Math.max(0, history.length - 1 - windowSize);
      const pastPoint = history[backIdx];

      const timeDiff = currentPoint.time - pastPoint.time;
      if (timeDiff > 0) {
        orderUtilization = Math.min(100, Math.max(0, ((currentPoint.rawOrderBusy - pastPoint.rawOrderBusy) / timeDiff) * 100));
        payUtilization = Math.min(100, Math.max(0, ((currentPoint.rawPayBusy - pastPoint.rawPayBusy) / timeDiff) * 100));
        pickupUtilization = Math.min(100, Math.max(0, ((currentPoint.rawPickupBusy - pastPoint.rawPickupBusy) / timeDiff) * 100));
      }
    }

    // Fallback to cumulative if history is too short
    if (history.length < 2 || (orderUtilization === 0 && payUtilization === 0 && pickupUtilization === 0)) {
      orderUtilization = this.simTime > 0 ? (this.stats.orderBusyTime / this.simTime) * 100 : 0;
      payUtilization = this.simTime > 0 ? (this.stats.payBusyTime / this.simTime) * 100 : 0;
      pickupUtilization = this.simTime > 0 ? (this.stats.pickupBusyTime / this.simTime) * 100 : 0;
    }

    // Detect bottleneck based on rolling utilization
    let bottleneck = 'None';
    if (this.simTime > 0) {
      const maxUtil = Math.max(orderUtilization, payUtilization, pickupUtilization);
      if (maxUtil > 50) { // only flag if utilization is significant
        if (maxUtil === orderUtilization) bottleneck = 'Order Post';
        else if (maxUtil === payUtilization && this.windowMode === 'dual') bottleneck = 'Payment Window';
        else bottleneck = 'Pickup Window';
      }
    }

    return {
      simTime: this.simTime,
      servedCount: this.stats.servedCount,
      balkedCount: this.stats.balkedCount,
      activeQueueLength,
      maxQueueLength: this.stats.maxQueueLength,
      avgWaitingTime,
      avgSystemTime,
      orderUtilization,
      payUtilization: this.windowMode === 'dual' ? payUtilization : 0,
      pickupUtilization,
      bottleneck
    };
  }

  reset() {
    this.simTime = 0;
    this.cars = [];
    this.nextCarId = 1;
    this.stats = {
      servedCount: 0,
      balkedCount: 0,
      totalWaitingTime: 0,
      totalSystemTime: 0,
      maxQueueLength: 0,
      orderBusyTime: 0,
      payBusyTime: 0,
      pickupBusyTime: 0,
      history: []
    };
    this.nextArrivalTime = this.simTime + getRandomExponential(this.arrivalRate);
    this.lastHistoryRecordTime = 0;
    this.lastServedWaitingTimes = [];
  }
}
