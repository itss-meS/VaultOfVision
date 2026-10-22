package ai.redesignededge.engine

import java.util.concurrent.atomic.AtomicBoolean

class SingleFlight {
    private val busy = AtomicBoolean(false)

    fun tryAcquire(): Boolean = busy.compareAndSet(false, true)

    fun release() {
        busy.set(false)
    }

    fun <T> run(block: () -> T): T {
        if (!tryAcquire()) throw EngineFault("busy", "engine busy")
        try {
            return block()
        } finally {
            release()
        }
    }
}
