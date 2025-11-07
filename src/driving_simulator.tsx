import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
// Let TypeScript know Qualtrics exists globally
declare const Qualtrics: any;

interface ModeBySecond {
  second: number;
  mode: string;
}

interface SimulationData {
  modeBySecond: ModeBySecond[];
  whiteBlocksHit: number;
  finalScore: number;
}

interface AutopilotDecision {
  accelerate: boolean;
  lane: number;
  targetSpeed: number;
}

interface Keys {
  w: boolean;
  a: boolean;
  s: boolean;
  d: boolean;
  [key: string]: boolean;
}

const DrivingSimulator = () => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isAutopilot, setIsAutopilot] = useState(false);
  const [autopilotPending, setAutopilotPending] = useState(false);
  const [timeLeft, setTimeLeft] = useState(90);
  const [isComplete, setIsComplete] = useState(false);
  const [score, setScore] = useState(1000);
  const [scoreFlash, setScoreFlash] = useState(false);
  const [showInstructions, setShowInstructions] = useState(true);
  const [gameStarted, setGameStarted] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [speed, setSpeed] = useState(0);
  const isCompleteRef = useRef(false);
  const gameStartedRef = useRef(false);
  const startTimeRef = useRef<number | null>(null);
  const autopilotRef = useRef(false);
  const autopilotPendingRef = useRef(false);
  const scoreRef = useRef(1000);
  const flashTimeoutRef = useRef<number | null>(null);
  const countdownIntervalRef = useRef<number | null>(null);
  const simulationDataRef = useRef<SimulationData>({
    modeBySecond: [], // Track mode at each second
    whiteBlocksHit: 0, // Count white block collisions
    finalScore: 0
  });

  const startGame = () => {
    setShowInstructions(false);
    setCountdown(3);
    setIsAutopilot(false);
    autopilotRef.current = false;
    autopilotPendingRef.current = false;
    setAutopilotPending(false);
    
    // Start countdown
    let count = 3;
    countdownIntervalRef.current = window.setInterval(() => {
      count--;
      if (count > 0) {
        setCountdown(count);
      } else if (count === 0) {
        setCountdown(0); // Show "GO!"
        setTimeout(() => {
          setCountdown(null);
          gameStartedRef.current = true;
          setGameStarted(true);
          startTimeRef.current = Date.now();
          scoreRef.current = 1000;
          setScore(1000);
          if (countdownIntervalRef.current) {
            clearInterval(countdownIntervalRef.current);
          }
        }, 500);
      }
    }, 1000);
  };

  const handleToggleAutopilot = () => {
    if (isAutopilot || autopilotPendingRef.current) {
      // Cancel autopilot or any pending activation
      setIsAutopilot(false);
      autopilotRef.current = false;
      autopilotPendingRef.current = false;
      setAutopilotPending(false);
    } else {
      // Queue autopilot activation until the path ahead is clear
      autopilotPendingRef.current = true;
      setAutopilotPending(true);
    }
  };

  useEffect(() => {
    autopilotRef.current = isAutopilot;
  }, [isAutopilot]);

  useEffect(() => {
    isCompleteRef.current = isComplete;
  }, [isComplete]);

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const width = container.offsetWidth;
    const height = container.offsetHeight;

    // Scene setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB);
    scene.fog = new THREE.Fog(0x87CEEB, 50, 200);

    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xffffff, 0.8);
    sunLight.position.set(50, 100, 50);
    sunLight.castShadow = true;
    scene.add(sunLight);

    // Define lanes first
    const lanes = [-2, 0, 2];

    // Car setup
    const carGroup = new THREE.Group();
    const carBody = new THREE.Mesh(
      new THREE.BoxGeometry(2, 1, 4),
      new THREE.MeshStandardMaterial({ color: 0xff0000, metalness: 0.7, roughness: 0.3 })
    );
    carBody.position.y = 0.5;
    carBody.castShadow = true;
    carGroup.add(carBody);

    const carTop = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 0.8, 2),
      new THREE.MeshStandardMaterial({ color: 0xff0000, metalness: 0.7, roughness: 0.3 })
    );
    carTop.position.set(0, 1.3, -0.3);
    carTop.castShadow = true;
    carGroup.add(carTop);

    // Wheels
    const wheelGeometry = new THREE.CylinderGeometry(0.4, 0.4, 0.3, 16);
    const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x222222 });
    const wheelPositions: [number, number, number][] = [
      [-1, 0.4, 1.3], [1, 0.4, 1.3],
      [-1, 0.4, -1.3], [1, 0.4, -1.3]
    ];
    
    wheelPositions.forEach(pos => {
      const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(pos[0], pos[1], pos[2]);
      wheel.castShadow = true;
      carGroup.add(wheel);
    });

    carGroup.position.set(0, 0, 0);
    scene.add(carGroup);

    camera.position.set(0, 3, 8);
    camera.lookAt(carGroup.position);

    // Road
    const roadMaterial = new THREE.MeshStandardMaterial({ color: 0x333333 });
    const roadSegments: THREE.Mesh[] = [];
    
    for (let i = -10; i < 50; i++) {
      const road = new THREE.Mesh(
        new THREE.PlaneGeometry(8, 20),
        roadMaterial
      );
      road.rotation.x = -Math.PI / 2;
      road.position.set(0, 0, i * 20);
      road.receiveShadow = true;
      scene.add(road);
      roadSegments.push(road);

      for (let j = 0; j < 4; j++) {
        const marking = new THREE.Mesh(
          new THREE.PlaneGeometry(0.3, 2),
          new THREE.MeshBasicMaterial({ color: 0xffffff })
        );
        marking.rotation.x = -Math.PI / 2;
        marking.position.set(0, 0.02, i * 20 + j * 5);
        scene.add(marking);
      }

      [-6, 6].forEach(x => {
        const sidewalk = new THREE.Mesh(
          new THREE.PlaneGeometry(4, 20),
          new THREE.MeshStandardMaterial({ color: 0x999999 })
        );
        sidewalk.rotation.x = -Math.PI / 2;
        sidewalk.position.set(x, 0.01, i * 20);
        sidewalk.receiveShadow = true;
        scene.add(sidewalk);
      });
    }

    // Buildings
    for (let i = -5; i < 40; i += 3) {
      [-15, 15].forEach(x => {
        const height = 10 + Math.random() * 20;
        const building = new THREE.Mesh(
          new THREE.BoxGeometry(8, height, 8),
          new THREE.MeshStandardMaterial({ 
            color: new THREE.Color().setHSL(0.1, 0.2, 0.3 + Math.random() * 0.3),
            metalness: 0.3,
            roughness: 0.7
          })
        );
        building.position.set(x, height / 2, i * 20);
        building.castShadow = true;
        building.receiveShadow = true;
        scene.add(building);

        for (let floor = 0; floor < height / 3; floor++) {
          for (let w = 0; w < 3; w++) {
            const window = new THREE.Mesh(
              new THREE.PlaneGeometry(1, 1.5),
              new THREE.MeshBasicMaterial({ 
                color: Math.random() > 0.3 ? 0xffffaa : 0x222222 
              })
            );
            window.position.set(
              x + (x > 0 ? -4.01 : 4.01),
              2 + floor * 3,
              i * 20 - 3 + w * 2.5
            );
            window.rotation.y = x > 0 ? Math.PI / 2 : -Math.PI / 2;
            scene.add(window);
          }
        }
      });
    }

    // Traffic - white blocks (minimal and very far apart)
    const otherCars: THREE.Mesh[] = [];
    const trafficPatterns = [
      { lane: 0, z: -400 },
      { lane: 2, z: -1200 },
    ];
    
    trafficPatterns.forEach(pattern => {
      const otherCar = new THREE.Mesh(
        new THREE.BoxGeometry(2, 2, 4),
        new THREE.MeshStandardMaterial({ 
          color: 0xffffff,
          metalness: 0.5,
          roughness: 0.5,
          emissive: 0xffffff,
          emissiveIntensity: 0.3
        })
      );
      otherCar.position.set(lanes[pattern.lane], 1, pattern.z);
      otherCar.castShadow = true;
      otherCar.userData.isRegularTraffic = true;
      scene.add(otherCar);
      otherCars.push(otherCar);
    });

    // White blocks - spawn throughout the game
    const finalBlocks: THREE.Mesh[] = [];
    const blockSpawnInterval = 3; // Spawn blocks every 3 seconds
    let lastBlockSpawnTime = 0;

    // Finish line (static)
    const finishLineZ = -7000;
    const finishLine = new THREE.Mesh(
      new THREE.PlaneGeometry(8, 2),
      new THREE.MeshBasicMaterial({ color: 0xffff00 })
    );
    finishLine.rotation.x = -Math.PI / 2;
    finishLine.position.set(0, 0.03, finishLineZ);
    scene.add(finishLine);

    // Game state
    let carVelocity = 0;
    let carLaneOffset = 0;
    let targetLane = 0;
    let currentLaneIndex = 1;
    const collisionCooldown = new Map();
    let wasAutopilot = false; // Track previous autopilot state
    let finishLineCrossed = false;
    let finishLineCrossTime: number | null = null;
    
    const keys: Keys = {
      w: false,
      a: false,
      s: false,
      d: false
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (key in keys) {
        keys[key] = true;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (key in keys) {
        keys[key] = false;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    // Timer - only start when game begins
    let lastScoreDeduction = 0;
    let lastSecondLogged = -1;
    
    const timerInterval = setInterval(() => {
      if (!startTimeRef.current || !gameStartedRef.current || isCompleteRef.current) return;
      
      const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
      const remaining = Math.max(0, 90 - elapsed);
      setTimeLeft(remaining);
      
      // Log mode at each second
      if (elapsed !== lastSecondLogged && elapsed <= 90) {
        simulationDataRef.current.modeBySecond.push({
          second: elapsed,
          mode: autopilotRef.current ? 'autopilot' : 'manual'
        });
        lastSecondLogged = elapsed;
      }
      
      const now = Date.now();
      if (lastScoreDeduction === 0) {
        lastScoreDeduction = now;
      }
      if (now - lastScoreDeduction >= 1000) {
        scoreRef.current = Math.max(0, scoreRef.current - 5);
        setScore(scoreRef.current);
        lastScoreDeduction = now;
      }
      
      if (remaining === 0 && !finishLineCrossed) {
        // Timer reached 0 - game complete (even if finish line not reached)
        finishLineCrossed = true;
        finishLineCrossTime = Date.now();
        simulationDataRef.current.finalScore = scoreRef.current;
        setIsComplete(true);
        clearInterval(timerInterval);
        
        // Remove all blocks immediately
        finalBlocks.forEach(block => {
          scene.remove(block);
        });
        finalBlocks.length = 0;
        
        // Log final data to console
        console.log('=== SIMULATION DATA ===');
        console.log('Mode by second:', simulationDataRef.current.modeBySecond);
        console.log('White blocks hit:', simulationDataRef.current.whiteBlocksHit);
        console.log('Final score:', simulationDataRef.current.finalScore);
        console.log('======================');
        
        // Save data to Qualtrics if available
        if (typeof Qualtrics !== 'undefined') {
          Qualtrics.SurveyEngine.setEmbeddedData('sim_mode_by_second', JSON.stringify(simulationDataRef.current.modeBySecond));
          Qualtrics.SurveyEngine.setEmbeddedData('sim_white_blocks_hit', simulationDataRef.current.whiteBlocksHit);
          Qualtrics.SurveyEngine.setEmbeddedData('sim_final_score', simulationDataRef.current.finalScore);
          console.log('Data saved to Qualtrics embedded data');
        }
      }
    }, 100);

    const handleResize = () => {
      if (!container) return;
      const width = container.offsetWidth;
      const height = container.offsetHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };

    window.addEventListener('resize', handleResize);

    // Animation
    let autopilotTimer = 0;
    let autopilotDecision: AutopilotDecision = { accelerate: true, lane: 1, targetSpeed: 1.3 };
    let animationId: number | undefined;
    let frameCount = 0;
    
    const animate = () => {
      animationId = requestAnimationFrame(animate);
      frameCount++;

      // Allow car movement even before game starts, but only run game logic after start
      const elapsed = startTimeRef.current && gameStartedRef.current 
        ? Math.floor((Date.now() - startTimeRef.current) / 1000) 
        : -1;
      
      // Only run game logic (spawning, scoring) if game has started
      if (elapsed >= 0 && elapsed >= 90) {
        renderer.render(scene, camera);
        return;
      }

      // Don't spawn blocks after finish line is crossed
      if (finishLineCrossed) {
        // Skip all block spawning
      } else if (elapsed >= 5 && elapsed < 80) {
        // Check if it's time to spawn blocks (every 3 seconds)
        const secondsSinceLastSpawn = elapsed - lastBlockSpawnTime;
        if (secondsSinceLastSpawn >= blockSpawnInterval) {
          lastBlockSpawnTime = elapsed;
          const spawnDistance = 80;
          // Density increases marginally every 10 seconds: base 3, +1 every 10 seconds
          const densityMultiplier = Math.floor(elapsed / 10);
          const blocksToSpawn = 3 + densityMultiplier; // Starts at 3, increases over time
          
          // Spawn blocks with varied spacing to avoid visible clusters
          let cumulativeDistance = 0;
          for (let i = 0; i < blocksToSpawn; i++) {
            const block = new THREE.Mesh(
              new THREE.BoxGeometry(2, 2, 4),
              new THREE.MeshStandardMaterial({ 
                color: 0xffffff,
                metalness: 0.5,
                roughness: 0.5,
                emissive: 0xffffff,
                emissiveIntensity: 0.3
              })
            );
            // Vary spacing between blocks (3-6 units) to break up the pattern
            const spacing = 3 + (Math.random() * 3);
            cumulativeDistance += spacing;
            block.position.set(0, 1, carGroup.position.z - spawnDistance - cumulativeDistance);
            block.castShadow = true;
            block.userData.isFinalBlock = true;
            scene.add(block);
            finalBlocks.push(block);
          }
        }
      }

      // End-game blocks (last 10s): same style as beginning, just denser, middle lane only
      if (!finishLineCrossed && elapsed >= 80 && elapsed < 90 && elapsed >= 0) {
        const secondsSinceLastSpawn = elapsed - lastBlockSpawnTime;
        if (secondsSinceLastSpawn >= 1) { // spawn every second near the end
          lastBlockSpawnTime = elapsed;
          const spawnDistance = 70;
          // Continue density increase: base 5, but also factor in the 10-second multiplier
          const densityMultiplier = Math.floor(elapsed / 10);
          const blocksToSpawn = 5 + densityMultiplier; // Continues density progression
          let cumulativeDistance = 0;
          for (let i = 0; i < blocksToSpawn; i++) {
            const block = new THREE.Mesh(
              new THREE.BoxGeometry(2, 2, 4),
              new THREE.MeshStandardMaterial({ 
                color: 0xffffff,
                metalness: 0.5,
                roughness: 0.5,
                emissive: 0xffffff,
                emissiveIntensity: 0.35
              })
            );
            // Vary spacing to avoid visible clusters (2-4 units)
            const spacing = 2 + (Math.random() * 2);
            cumulativeDistance += spacing;
            block.position.set(0, 1, carGroup.position.z - spawnDistance - cumulativeDistance);
            block.castShadow = true;
            block.userData.isFinalBlock = true;
            scene.add(block);
            finalBlocks.push(block);
          }
        }
      }

      // Increased density blocks near finish line (geographic check)
      const distanceToFinish = carGroup.position.z - finishLineZ;
      if (!finishLineCrossed && distanceToFinish > 0 && distanceToFinish < 300 && elapsed >= 0) {
        // Spawn blocks periodically when near finish line
        const secondsSinceLastSpawn = elapsed - lastBlockSpawnTime;
        if (secondsSinceLastSpawn >= 1) { // Every second
          lastBlockSpawnTime = elapsed;
          const spawnDistance = 60;
          
          // Spawn blocks in random lanes, but never all 3 at once - always leave at least one lane clear
          const lanesToSpawn = [];
          const numLanesToSpawn = Math.floor(Math.random() * 2) + 1; // 1 or 2 lanes (never 3)
          const shuffledLanes = [0, 1, 2].sort(() => Math.random() - 0.5);
          
          for (let i = 0; i < numLanesToSpawn; i++) {
            lanesToSpawn.push(shuffledLanes[i]);
          }
          
          // Spawn 1-2 blocks per selected lane
          lanesToSpawn.forEach((laneIndex) => {
            const blocksInThisLane = Math.floor(Math.random() * 2) + 1; // 1 or 2 blocks
            let cumulativeDistance = 0;
            for (let i = 0; i < blocksInThisLane; i++) {
              const block = new THREE.Mesh(
                new THREE.BoxGeometry(2, 2, 4),
                new THREE.MeshStandardMaterial({ 
                  color: 0xffffff,
                  metalness: 0.5,
                  roughness: 0.5,
                  emissive: 0xffffff,
                  emissiveIntensity: 0.4 // Slightly brighter near finish
                })
              );
              const spacing = 4 + (Math.random() * 3);
              cumulativeDistance += spacing;
              block.position.set(lanes[laneIndex], 1, carGroup.position.z - spawnDistance - cumulativeDistance);
              block.castShadow = true;
              block.userData.isFinalBlock = true;
              scene.add(block);
              finalBlocks.push(block);
            }
          });
        }
      }

      if (!autopilotRef.current && autopilotPendingRef.current && elapsed >= 0) {
        let obstacleTooClose = false;
        const pendingObstacles: THREE.Mesh[] = [...otherCars, ...finalBlocks];
        pendingObstacles.forEach(obstacle => {
          const relativeZ = obstacle.position.z - carGroup.position.z;
          const relativeX = Math.abs(obstacle.position.x - carGroup.position.x);
          // Treat blocks within ~60 units ahead (and 15 units behind) as too close
          if (relativeZ < 15 && relativeZ > -60 && relativeX < 1.5) {
            obstacleTooClose = true;
          }
        });

        if (!obstacleTooClose) {
          autopilotPendingRef.current = false;
          setAutopilotPending(false);
          setIsAutopilot(true);
        }
      }

      if (autopilotRef.current && elapsed >= 0) {
        wasAutopilot = true;
        autopilotTimer++;
        
        const allObstacles: THREE.Mesh[] = [...otherCars, ...finalBlocks];
        const laneInfo = [
          { safe: true, nearestObstacle: Infinity },
          { safe: true, nearestObstacle: Infinity },
          { safe: true, nearestObstacle: Infinity }
        ];
        let emergencyStop = false;
        
        allObstacles.forEach(obstacle => {
          const relativeZ = obstacle.position.z - carGroup.position.z;
          if (relativeZ < 40 && relativeZ > -800) {
            const obstacleX = obstacle.position.x;
            const distance = Math.abs(relativeZ);
            
            if (distance < 40 && Math.abs(obstacleX - carGroup.position.x) < 1.5) {
              emergencyStop = true;
            }
            
            for (let i = 0; i < 3; i++) {
              const laneCenterX = lanes[i];
              const distanceFromLaneCenter = Math.abs(obstacleX - laneCenterX);
              if (distanceFromLaneCenter < 0.6) {
                if (distance < laneInfo[i].nearestObstacle) {
                  laneInfo[i].nearestObstacle = distance;
                }
                if (distance < 350) {
                  laneInfo[i].safe = false;
                }
              }
            }
          }
        });
        
        let bestLane = currentLaneIndex;
        let maxDistance = laneInfo[currentLaneIndex].nearestObstacle;
        
        for (let i = 0; i < 3; i++) {
          if (laneInfo[i].nearestObstacle > maxDistance + 35) {
            maxDistance = laneInfo[i].nearestObstacle;
            bestLane = i;
          }
        }
        
        if (!laneInfo[currentLaneIndex].safe) {
          for (let i = 0; i < 3; i++) {
            if (laneInfo[i].safe && laneInfo[i].nearestObstacle > laneInfo[currentLaneIndex].nearestObstacle) {
              bestLane = i;
              maxDistance = laneInfo[i].nearestObstacle;
            }
          }
        }
        
        for (let i = 0; i < 3; i++) {
          if (laneInfo[i].nearestObstacle > laneInfo[bestLane].nearestObstacle) {
            bestLane = i;
          }
        }
        
        if (laneInfo[bestLane].nearestObstacle > 450 && bestLane !== 1 && laneInfo[1].nearestObstacle > 450) {
          if (autopilotTimer % 90 === 0) {
            bestLane = 1;
          }
        }
        
        autopilotDecision = {
          accelerate: true,
          lane: bestLane,
          targetSpeed: 1.5
        };
        
        const bestLaneInfo = laneInfo[bestLane];
        const shouldEmergencyBrake = emergencyStop || (!bestLaneInfo.safe && bestLaneInfo.nearestObstacle < 120);
        
        const autopilotSpeed = 1.0;
        let immediateObstacleAhead = false;
        allObstacles.forEach(obstacle => {
          const relativeZ = obstacle.position.z - carGroup.position.z;
          const relativeX = Math.abs(obstacle.position.x - carGroup.position.x);
          if (relativeZ < 25 && relativeZ > -80 && relativeX < 1.3) {
            immediateObstacleAhead = true;
          }
        });
        
        if (shouldEmergencyBrake) {
          carVelocity = Math.max(carVelocity - 0.08, 0.15);
        } else if (immediateObstacleAhead) {
          carVelocity = Math.max(carVelocity - 0.05, 0.25);
        } else {
          if (carVelocity < autopilotSpeed) {
            carVelocity = Math.min(carVelocity + 0.05, autopilotSpeed);
          } else if (carVelocity > autopilotSpeed) {
            carVelocity = Math.max(carVelocity - 0.08, autopilotSpeed);
          }
        }
        
        if (autopilotDecision.lane !== currentLaneIndex) {
          currentLaneIndex = autopilotDecision.lane;
          targetLane = lanes[currentLaneIndex];
        }
      } else {
        // Manual control - car starts moving automatically, player can accelerate/decelerate
        
        // When switching from autopilot to manual, cap speed immediately
        if (wasAutopilot) {
          carVelocity = Math.min(carVelocity, 0.5); // Cap to manual max (60 MPH)
          wasAutopilot = false;
        }
        
        // Auto-accelerate in manual mode (car starts moving automatically)
        if (carVelocity < 0.5) {
          carVelocity = Math.min(carVelocity + 0.005, 0.5); // Gradual acceleration to max 60 MPH
        }
        
        // Player can accelerate further with W key
        if (keys.w) {
          carVelocity = Math.min(carVelocity + 0.008, 0.5); // Max 60 MPH (0.5 carVelocity)
        }
        if (keys.s) {
          carVelocity = Math.max(carVelocity - 0.025, 0);
        }
        if (keys.a && currentLaneIndex > 0) {
          currentLaneIndex--;
          targetLane = lanes[currentLaneIndex];
          keys.a = false;
        }
        if (keys.d && currentLaneIndex < 2) {
          currentLaneIndex++;
          targetLane = lanes[currentLaneIndex];
          keys.d = false;
        }
      }

      const laneChangeEase = autopilotRef.current ? 0.2 : 0.1;
      carLaneOffset += (targetLane - carLaneOffset) * laneChangeEase;
      carGroup.position.x = carLaneOffset;
      carGroup.position.z -= carVelocity;
      
      // Calculate speed in MPH
      // Manual: 0 to 60 MPH (carVelocity 0 to 0.5)
      // Autopilot: constant 120 MPH (carVelocity 1.0)
      let speedMPH: number;
      if (autopilotRef.current) {
        // Autopilot: constant 120 MPH
        speedMPH = Math.round(carVelocity * (120 / 1.0)); // 1.0 carVelocity = 120 MPH
        speedMPH = Math.min(120, speedMPH); // Cap at 120 MPH
      } else {
        // Manual: 0 to 60 MPH (carVelocity 0 to 0.5)
        speedMPH = Math.round(carVelocity * (60 / 0.5)); // 0.5 carVelocity = 60 MPH
      }
      setSpeed(speedMPH);

      otherCars.forEach((car, index) => {
        car.position.z += 0.03; // Even slower traffic
        
        // Respawn far behind with huge spacing
        if (car.position.z > carGroup.position.z + 150) {
          car.position.z = carGroup.position.z - 800 - (index * 500);
          // Cycle through lanes in pattern
          const lanePattern = [0, 2, 1];
          car.position.x = lanes[lanePattern[index % lanePattern.length]];
          collisionCooldown.delete(index);
        }
        
        // Collision detection with better tolerances
        const dx = Math.abs(car.position.x - carGroup.position.x);
        const dz = Math.abs(car.position.z - carGroup.position.z);
        
        if (dx < 1.3 && dz < 2.5) {
          if (!collisionCooldown.has(index) || frameCount - collisionCooldown.get(index) > 60) {
            scoreRef.current = Math.max(0, scoreRef.current - 10);
            setScore(scoreRef.current);
            
            if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
            setScoreFlash(true);
            flashTimeoutRef.current = window.setTimeout(() => setScoreFlash(false), 300);
            
            collisionCooldown.set(index, frameCount);
          }
        }
      });

      // Clean up blocks that are far behind the car (only if finish line not crossed)
      if (!finishLineCrossed) {
        for (let i = finalBlocks.length - 1; i >= 0; i--) {
          const block = finalBlocks[i];
          if (block.position.z > carGroup.position.z + 200) {
            // Remove block from scene and array
            scene.remove(block);
            finalBlocks.splice(i, 1);
            continue;
          }
          
          const dx = Math.abs(block.position.x - carGroup.position.x);
          const dz = Math.abs(block.position.z - carGroup.position.z);
          
          const blockKey = `block_${i}`;
          if (dx < 1.8 && dz < 3) {
            if (!collisionCooldown.has(blockKey) || frameCount - collisionCooldown.get(blockKey) > 60) {
              scoreRef.current = Math.max(0, scoreRef.current - 10);
              setScore(scoreRef.current);
              
              // Track white block collision
              simulationDataRef.current.whiteBlocksHit++;
              
              if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
              setScoreFlash(true);
              flashTimeoutRef.current = window.setTimeout(() => setScoreFlash(false), 300);
              
              collisionCooldown.set(blockKey, frameCount);
            }
          }
        }
      }

      roadSegments.forEach(road => {
        if (road.position.z > carGroup.position.z + 50) {
          road.position.z -= 1200;
        }
      });

      camera.position.x = carGroup.position.x;
      camera.position.z = carGroup.position.z + 8;
      camera.lookAt(carGroup.position.x, carGroup.position.y, carGroup.position.z - 5);

      // Check finish line crossing
      if (carGroup.position.z <= finishLineZ && !isCompleteRef.current && !finishLineCrossed) {
        finishLineCrossed = true;
        finishLineCrossTime = Date.now();
        simulationDataRef.current.finalScore = scoreRef.current;
        setIsComplete(true);
        
        // Remove all blocks immediately
        finalBlocks.forEach(block => {
          scene.remove(block);
        });
        finalBlocks.length = 0;
      }
      
      // Stop car after 5 seconds of coasting past finish line
      if (finishLineCrossed && finishLineCrossTime) {
        const timeSinceFinish = (Date.now() - finishLineCrossTime) / 1000;
        if (timeSinceFinish >= 5) {
          carVelocity = 0;
        }
      }

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      if (animationId !== undefined) {
        cancelAnimationFrame(animationId);
      }
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('resize', handleResize);
      clearInterval(timerInterval);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
      if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
      if (container && renderer.domElement && container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []);

  return (
    <div style={{ width: '100%', height: '100vh', overflow: 'hidden', position: 'relative' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      
      {countdown !== null && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          background: 'rgba(0, 0, 0, 0.8)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1001,
          color: 'white'
        }}>
          <div style={{
            fontSize: '120px',
            fontWeight: 'bold',
            color: countdown === 0 ? '#44ff44' : '#ffd700',
            textShadow: '0 0 20px rgba(255, 255, 255, 0.5)'
          }}>
            {countdown === 0 ? 'GO!' : countdown}
          </div>
        </div>
      )}
      
      {showInstructions && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          background: 'rgba(0, 0, 0, 0.95)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 1000,
          color: 'white',
          padding: '40px'
        }}>
          <div style={{
            maxWidth: '600px',
            textAlign: 'center',
            fontSize: '18px',
            lineHeight: '1.6'
          }}>
            <h1 style={{ fontSize: '36px', marginBottom: '30px', color: '#ffd700' }}>
              🚗 Safe Driving Simulator 🚗
            </h1>
            <div style={{ fontSize: '20px', marginBottom: '20px', fontWeight: 'bold' }}>
              Your Mission:
            </div>
            <p style={{ marginBottom: '15px' }}>
              This is a <strong>Safe Driving Simulator</strong>. Your goal is to reach the <strong>Finish Line</strong> as <b> as fast as possible</b>, but <b>safely</b>. You have <strong>90 seconds</strong> to complete the race.
            </p>
            <p style={{ marginBottom: '15px' }}>
              ⚠️ <strong>Your score decreases every second</strong>, so you need to keep moving. However, <strong>hitting the white blocks will also reduce your score</strong> - find the right balance between speed and avoiding obstacles!
            </p>
            <p style={{ marginBottom: '15px' }}>
              You can drive manually using <strong>WASD</strong> keys, or use the <strong>Autopilot</strong> feature. The autopilot is available whenever you need it - you can switch between manual control and autopilot as many times as you want during the race.
            </p>
            <p style={{ marginBottom: '30px', fontSize: '16px', color: '#cccccc' }}>
              Controls: <strong>W</strong> = Accelerate | <strong>S</strong> = Brake | <strong>A/D</strong> = Change Lanes
            </p>
            <button
              onClick={startGame}
              style={{
                padding: '15px 40px',
                fontSize: '20px',
                fontWeight: 'bold',
                background: '#44ff44',
                color: 'white',
                border: 'none',
                borderRadius: '10px',
                cursor: 'pointer',
                transition: 'all 0.3s'
              }}
              onMouseOver={(e) => e.currentTarget.style.background = '#33ee33'}
              onMouseOut={(e) => e.currentTarget.style.background = '#44ff44'}
            >
              START RACE!
            </button>
          </div>
        </div>
      )}
      
      {gameStarted && (
        <>
          <div style={{
            position: 'absolute',
            top: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            gap: '20px',
            alignItems: 'center'
          }}>
            <div style={{
              background: 'rgba(0, 0, 0, 0.7)',
              color: 'white',
              padding: '15px 30px',
              borderRadius: '10px',
              fontSize: '24px',
              fontFamily: 'monospace',
              fontWeight: 'bold'
            }}>
              {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
            </div>
            <div style={{
              background: scoreFlash ? '#ff0000' : 'rgba(0, 0, 0, 0.7)',
              color: scoreFlash ? 'white' : (score > 500 ? '#44ff44' : score > 250 ? '#ffaa44' : '#ff4444'),
              padding: '15px 30px',
              borderRadius: '10px',
              fontSize: '24px',
              fontFamily: 'monospace',
              fontWeight: 'bold',
              transition: 'background 0.1s, color 0.1s'
            }}>
              Score: {score}
            </div>
          </div>
          <div style={{
            position: 'absolute',
            top: '20px',
            right: '20px',
            background: isAutopilot ? 'rgba(68, 255, 68, 0.3)' : 'rgba(0, 0, 0, 0.7)',
            color: isAutopilot ? '#44ff44' : '#ffffff',
            padding: isAutopilot ? '20px 35px' : '15px 30px',
            borderRadius: '10px',
            fontSize: isAutopilot ? '32px' : '24px',
            fontFamily: 'monospace',
            fontWeight: 'bold',
            border: isAutopilot ? '3px solid #44ff44' : '2px solid #ffffff',
            boxShadow: isAutopilot ? '0 0 20px rgba(68, 255, 68, 0.6)' : 'none',
            animation: isAutopilot ? 'pulse 2s ease-in-out infinite' : 'none',
            transition: 'all 0.3s ease'
          }}>
            {speed} MPH
            {isAutopilot && <div style={{ fontSize: '12px', marginTop: '5px', opacity: 0.8 }}>AUTOPILOT</div>}
          </div>
          {isAutopilot && (
            <style>{`
              @keyframes pulse {
                0%, 100% { transform: scale(1); }
                50% { transform: scale(1.05); }
              }
            `}</style>
          )}
        </>
      )}

      {!isComplete && (
        <div style={{
          position: 'absolute',
          bottom: '30px',
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          gap: '20px',
          alignItems: 'center'
        }}>
          <div style={{
            background: autopilotPending ? 'rgba(255, 170, 68, 0.85)' : 'rgba(0, 0, 0, 0.7)',
            color: 'white',
            padding: '10px 20px',
            borderRadius: '8px',
            fontFamily: 'Arial, sans-serif'
          }}>
            {isAutopilot ? '🤖 AUTOPILOT' : autopilotPending ? '⏳ AUTOPILOT (waiting for clear lane)' : '👤 MANUAL (WASD)'}
          </div>
          
          <button
            onClick={handleToggleAutopilot}
            style={{
              padding: '12px 24px',
              fontSize: '16px',
              fontWeight: 'bold',
              background: isAutopilot ? '#ff4444' : autopilotPending ? '#ffaa44' : '#44ff44',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              transition: 'all 0.3s'
            }}
          >
            {isAutopilot ? 'Take Control' : autopilotPending ? 'Cancel Autopilot Request' : 'Enable Autopilot'}
          </button>
        </div>
      )}

      {isComplete && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: 'rgba(0, 0, 0, 0.9)',
          color: 'white',
          padding: '40px 60px',
          borderRadius: '15px',
          fontSize: '32px',
          fontFamily: 'Arial, sans-serif',
          textAlign: 'center',
          fontWeight: 'bold'
        }}>
          🏁 Race Complete! 🏁
          <div style={{ fontSize: '24px', marginTop: '20px' }}>
            Final Score: {score}
          </div>
          <div style={{ fontSize: '18px', marginTop: '15px', color: '#ffaa44' }}>
            Blocks Hit: {simulationDataRef.current.whiteBlocksHit}
          </div>
          <div style={{ fontSize: '14px', marginTop: '10px', color: '#aaaaaa' }}>
            (Data logged to browser console)
          </div>
        </div>
      )}
    </div>
  );
};

export default DrivingSimulator;