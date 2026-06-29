package app.restful.services;

/**
 * Minimal synchronous text-completion abstraction over the chat model.
 *
 * <p>Lets {@link CameraTipRenderer} (and its tests) render a tip without
 * depending on LangChain4j types directly. The concrete bean is created in
 * {@code DynamicOllamaConfig} only when Ollama is configured; consumers inject
 * it with {@code @Autowired(required = false)} and fall back when it is null.</p>
 */
@FunctionalInterface
public interface TipModel {
    /** Complete the prompt into a short tip. May throw if the model call fails. */
    String render(String prompt);
}
