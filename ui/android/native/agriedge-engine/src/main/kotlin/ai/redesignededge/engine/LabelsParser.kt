package ai.redesignededge.engine

object LabelsParser {
    fun parse(text: String): List<String> {
        val c = Cursor(text.removePrefix("\uFEFF"))
        c.skipSpace()
        c.expect('[')
        c.skipSpace()
        val out = ArrayList<String>()
        if (c.peek() == ']') {
            c.next()
            c.finish()
            return out
        }
        while (true) {
            c.skipSpace()
            out.add(c.string())
            c.skipSpace()
            val sep = c.next()
            if (sep == ']') break
            if (sep != ',') throw bad()
        }
        c.finish()
        return out
    }

    private fun bad(): EngineFault = EngineFault("model_mismatch", "labels file is not a list of strings")

    private class Cursor(private val s: String) {
        private var i = 0

        fun peek(): Char = if (i < s.length) s[i] else '\u0000'

        fun next(): Char {
            if (i >= s.length) throw bad()
            return s[i++]
        }

        fun skipSpace() {
            while (i < s.length && (s[i] == ' ' || s[i] == '\n' || s[i] == '\r' || s[i] == '\t')) i++
        }

        fun expect(ch: Char) {
            if (next() != ch) throw bad()
        }

        fun finish() {
            skipSpace()
            if (i != s.length) throw bad()
        }

        fun string(): String {
            expect('"')
            val sb = StringBuilder()
            while (true) {
                val ch = next()
                if (ch == '"') return sb.toString()
                if (ch < ' ') throw bad()
                if (ch != '\\') {
                    sb.append(ch)
                    continue
                }
                when (next()) {
                    '"' -> sb.append('"')
                    '\\' -> sb.append('\\')
                    '/' -> sb.append('/')
                    'b' -> sb.append('\b')
                    'f' -> sb.append('\u000C')
                    'n' -> sb.append('\n')
                    'r' -> sb.append('\r')
                    't' -> sb.append('\t')
                    'u' -> {
                        var code = 0
                        repeat(4) {
                            val d = Character.digit(next(), 16)
                            if (d < 0) throw bad()
                            code = code * 16 + d
                        }
                        sb.append(code.toChar())
                    }
                    else -> throw bad()
                }
            }
        }
    }
}
