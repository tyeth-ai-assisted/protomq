/**
 * Runner API — triggers play-script runs and tracks completion.
 *
 * POST /api/runner/run        — start a run
 * GET  /api/runner/run/:id/status — poll run status
 * GET  /api/runner/runs       — list all runs
 */
import { getScriptState, setActiveScript, deactivateScript } from '../broker/protobuf_autoresponders.js'

// In-memory run store (non-persistent, fine for now)
const runs = new Map()
let runSeq = 0

const generateRunId = (boardId) => {
  runSeq++
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  return `${date}-${boardId}-${String(runSeq).padStart(3, '0')}`
}

export default (router, broker) => {
  console.log("Installing Runner API")

  // Start a new run
  router.post('/runner/run', (req, res) => {
    const { board_id, script, firmware, options = {} } = req.body

    if (!script) {
      return res.status(400).json({ error: 'Missing required field: script' })
    }

    const { scripts } = getScriptState()
    if (!scripts.has(script)) {
      return res.status(404).json({ error: `Script not found: ${script}`, available: [...scripts.keys()] })
    }

    const scriptDef = scripts.get(script)
    const runId = generateRunId(board_id || script)

    // Count enabled steps
    const enabledSteps = scriptDef.steps.filter(s => s.enabled !== false)
    const enabledStepNames = enabledSteps.map(s => s.name)

    // Activate the script
    const ok = setActiveScript(script, { autoReset: true })
    if (!ok) {
      return res.status(500).json({ error: `Failed to activate script: ${script}` })
    }

    const run = {
      run_id: runId,
      status: 'running',
      script,
      board_id: board_id || null,
      firmware: firmware || 'v2',
      startTime: Date.now(),
      endTime: null,
      duration_ms: null,
      enabledStepNames,
      completedSteps: [],
      passed: null,
      error: null,
      assets: {},
      options
    }

    runs.set(runId, run)

    // Poll for completion every 500ms
    const pollInterval = setInterval(() => {
      const { activeExecutor, activeScriptName } = getScriptState()

      // Script was deactivated or changed externally
      if (!activeExecutor || activeScriptName !== script) {
        run.status = 'failed'
        run.error = 'Script was deactivated during run'
        run.endTime = Date.now()
        run.duration_ms = run.endTime - run.startTime
        clearInterval(pollInterval)
        console.log(`[Runner] Run ${runId} failed: script deactivated`)
        return
      }

      run.completedSteps = [...activeExecutor.completedSteps]

      // Check if all enabled steps are complete
      const allDone = enabledStepNames.every(name => activeExecutor.completedSteps.has(name))
      if (allDone) {
        run.status = 'complete'
        run.passed = true
        run.endTime = Date.now()
        run.duration_ms = run.endTime - run.startTime
        clearInterval(pollInterval)
        console.log(`[Runner] Run ${runId} complete in ${run.duration_ms}ms (${run.completedSteps.length}/${enabledStepNames.length} steps)`)

        // TODO: trigger video capture, pytest, HTML report generation
        // For now, just mark as complete with no assets
      }
    }, 500)

    // Timeout after 5 minutes
    setTimeout(() => {
      if (run.status === 'running') {
        run.status = 'failed'
        run.error = 'Timeout after 300s'
        run.endTime = Date.now()
        run.duration_ms = run.endTime - run.startTime
        clearInterval(pollInterval)
        console.log(`[Runner] Run ${runId} timed out`)
      }
    }, 300000)

    console.log(`[Runner] Started run ${runId}: script=${script}, firmware=${firmware || 'v2'}, steps=${enabledStepNames.length}`)

    res.status(202).json({
      run_id: runId,
      status: 'running',
      poll_url: `/api/runner/run/${runId}/status`,
      script,
      steps: enabledStepNames
    })
  })

  // Poll run status
  router.get('/runner/run/:runId/status', (req, res) => {
    const { runId } = req.params
    const run = runs.get(runId)

    if (!run) {
      return res.status(404).json({ error: `Run not found: ${runId}` })
    }

    // If still running, grab latest completedSteps from executor
    if (run.status === 'running') {
      const { activeExecutor } = getScriptState()
      if (activeExecutor) {
        run.completedSteps = [...activeExecutor.completedSteps]
      }
    }

    res.json({
      run_id: run.run_id,
      status: run.status,
      script: run.script,
      board_id: run.board_id,
      firmware: run.firmware,
      duration_ms: run.duration_ms,
      passed: run.passed,
      error: run.error,
      completedSteps: run.completedSteps,
      totalSteps: run.enabledStepNames.length,
      assets: run.assets
    })
  })

  // List all runs
  router.get('/runner/runs', (req, res) => {
    const list = [...runs.values()].map(r => ({
      run_id: r.run_id,
      status: r.status,
      script: r.script,
      board_id: r.board_id,
      firmware: r.firmware,
      duration_ms: r.duration_ms,
      passed: r.passed,
      completedSteps: r.completedSteps.length,
      totalSteps: r.enabledStepNames.length
    }))
    res.json({ runs: list })
  })
}
