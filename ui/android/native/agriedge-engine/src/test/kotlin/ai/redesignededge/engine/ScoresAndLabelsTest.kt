package ai.redesignededge.engine

import java.io.File
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Assume.assumeTrue
import org.junit.Test

class ScoresAndLabelsTest {
    @Test
    fun probabilitiesPassThrough() {
        val p = floatArrayOf(0.7f, 0.2f, 0.1f)
        assertTrue(Scores.isProbabilities(p))
        assertArrayEquals(p, Scores.normalize(p), 0f)
        assertEquals(0, Scores.argMax(p))
    }

    @Test
    fun logitsGetSoftmax() {
        val out = Scores.normalize(floatArrayOf(2f, 1f, -1f))
        assertEquals(1.0, out.sumOf { it.toDouble() }, 1e-6)
        assertEquals(0, Scores.argMax(out))
        assertTrue(out[0] > out[1] && out[1] > out[2])
    }

    @Test
    fun nonProbabilityPositiveVectorGetsSoftmax() {
        assertFalse(Scores.isProbabilities(floatArrayOf(3f, 2f, 1f)))
    }

    @Test
    fun invalidScoresFail() {
        for (bad in listOf(floatArrayOf(), floatArrayOf(Float.NaN, 1f), floatArrayOf(Float.POSITIVE_INFINITY, 0f))) {
            try {
                Scores.normalize(bad)
                fail("expected failure")
            } catch (e: EngineFault) {
                assertEquals("model_mismatch", e.code)
            }
        }
    }

    @Test
    fun argMaxPicksFirstOnTie() {
        assertEquals(0, Scores.argMax(floatArrayOf(0.5f, 0.5f)))
    }

    @Test
    fun labelsParse() {
        assertEquals(listOf("a", "B (c)", "d\"e", "\u00e9\u0905"), LabelsParser.parse(" [ \"a\" , \"B (c)\",\"d\\\"e\", \"\\u00e9\\u0905\" ] \n"))
        assertEquals(emptyList<String>(), LabelsParser.parse("[]"))
        assertEquals(listOf("x"), LabelsParser.parse("\uFEFF[\"x\"]"))
    }

    @Test
    fun badLabelsFail() {
        for (bad in listOf("", "{}", "[1]", "[\"a\",]", "[\"a\"", "[\"a\"] x", "[\"a\\q\"]", "[\"a\nb\"]", "[\"\\u12\"]", "null")) {
            try {
                LabelsParser.parse(bad)
                fail("expected failure for $bad")
            } catch (e: EngineFault) {
                assertEquals("model_mismatch", e.code)
            }
        }
    }

    @Test
    fun repoLabelsMatchPythonCounts() {
        val root = generateSequence(File("").absoluteFile) { it.parentFile }.firstOrNull { File(it, "models").isDirectory && File(it, "scripts").isDirectory }
        assumeTrue(root != null)
        val expected = mapOf("plantvillage-all" to 15, "cassava" to 5, "ip102" to 102, "router" to 3)
        for ((id, count) in expected) {
            val f = File(root, "models/$id/labels.json")
            assumeTrue(f.isFile)
            assertEquals(id, count, LabelsParser.parse(f.readText()).size)
        }
    }
}
