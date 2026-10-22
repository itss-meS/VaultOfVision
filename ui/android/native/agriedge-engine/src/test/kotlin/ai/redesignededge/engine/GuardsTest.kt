package ai.redesignededge.engine

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class GuardsTest {
    @Test
    fun readAssetAllowsOnlyListedNames() {
        assertTrue(AssetNames.isReadable("knowledge/banned_pesticides.json"))
        assertTrue(AssetNames.isReadable("knowledge/model_manifest.json.sig"))
        val bad = listOf(
            "", "../x", "knowledge/../models/ip102/vision.onnx", "/etc/passwd", "knowledge/",
            "knowledge/banned_pesticides.json ", "KNOWLEDGE/chunks.jsonl", "models/ip102/vision.onnx",
            "knowledge/banned_pesticides.json\u0000", "capacitor.config.json", "public/index.html",
        )
        for (name in bad) assertFalse(name, AssetNames.isReadable(name))
    }

    @Test
    fun kvKeysStayInNamespace() {
        for (ok in listOf("profiles", "profile:farmer1", "cases:farmer_1-A")) assertTrue(ok, KvKeys.isValidKey(ok))
        val bad = listOf(
            "", "profile", "profile:", "cases:", "other:x", "profile:a b", "profile:../x", "profile:a/b",
            "profiles:x", "Profiles", "profile:" + "a".repeat(65), "kv.profiles", "profile:x\n",
        )
        for (key in bad) assertFalse(key, KvKeys.isValidKey(key))
        assertTrue(KvKeys.isValidValue("x".repeat(KvKeys.MAX_VALUE_CHARS)))
        assertFalse(KvKeys.isValidValue("x".repeat(KvKeys.MAX_VALUE_CHARS + 1)))
    }

    @Test
    fun visionModelNamesResolve() {
        assertEquals("plantvillage-all", VisionModels.resolve("plantvillage")?.id)
        assertEquals("plantvillage-all", VisionModels.resolve("plantvillage-all")?.id)
        assertEquals(VisionKind.PEST, VisionModels.resolve("ip102")?.kind)
        assertEquals(VisionKind.DISEASE, VisionModels.resolve("cassava")?.kind)
        assertEquals(VisionKind.ROUTER, VisionModels.resolve("router")?.kind)
        for (bad in listOf("", "../ip102", "IP102", "ip102/", "unknown", "plantvillage-all/../x")) {
            assertNull(bad, VisionModels.resolve(bad))
        }
        assertNotNull(VisionModels.classifier("cassava"))
        assertNull(VisionModels.classifier("router"))
        assertNull(VisionModels.classifier("tomato"))
    }

    @Test
    fun modelNamesAreFixed() {
        assertTrue(ModelNames.isAllowed("llama32_1b_int4.pte"))
        assertTrue(ModelNames.isAllowed("tokenizer.model"))
        for (bad in listOf("", "../tokenizer.model", "tokenizer.model.part", "vision.onnx", "a/tokenizer.model")) {
            assertFalse(bad, ModelNames.isAllowed(bad))
        }
    }
}
