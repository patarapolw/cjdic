use lindera::dictionary::{DictionaryKind, load_dictionary_from_kind};
use lindera::mode::Mode;
use lindera::segmenter::Segmenter;
use lindera::tokenizer::Tokenizer;

#[derive(serde::Serialize)]
pub struct SegmentResult {
    t: String,
    r: Vec<String>,
}

pub struct LinderaAnalyzer {
    tokenizer: lindera::tokenizer::Tokenizer,
}

impl LinderaAnalyzer {
    pub fn new() -> Result<Self, Box<dyn std::error::Error>> {
        let dictionary = load_dictionary_from_kind(DictionaryKind::IPADIC)?;
        let segmenter = Segmenter::new(
            Mode::Normal,
            dictionary,
            None, // Assuming no user dictionary is provided
        );

        // Create a tokenizer.
        let tokenizer = Tokenizer::new(segmenter);
        Ok(LinderaAnalyzer { tokenizer })
    }

    pub fn analyze(&self, text: &str) -> Result<Vec<SegmentResult>, Box<dyn std::error::Error>> {
        let tokens = self.tokenizer.tokenize(text)?;
        let mut result_tokens = Vec::new();

        for token in tokens {
            let text = token.text.to_string();
            let details = token
                .clone()
                .details()
                .iter()
                .map(|f| f.to_string())
                .collect::<Vec<String>>();

            result_tokens.push(SegmentResult {
                t: text,
                r: details,
            });
        }

        Ok(result_tokens)
    }
}
