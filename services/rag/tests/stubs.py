class StubStructured:
    def __init__(self, replies):
        self.replies, self.calls, self.last_messages = list(replies), 0, None

    def invoke(self, messages):
        self.last_messages = messages
        r = self.replies[min(self.calls, len(self.replies) - 1)]
        self.calls += 1
        return r


class StubLLM:
    def __init__(self, replies):
        self.structured = StubStructured(replies)

    def with_structured_output(self, schema):
        return self.structured
