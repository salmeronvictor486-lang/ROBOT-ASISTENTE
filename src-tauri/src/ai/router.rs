//! Crea el proveedor que toca según los ajustes y reparte las llamadas.
//! (El trait `Provider` usa `async fn`, así que no vale como `dyn`: usamos un enum.)

use super::anthropic::Anthropic;
use super::demo::Demo;
use super::gemini::Gemini;
use super::ollama::Ollama;
use super::openai::{default_base_url, OpenAiCompatible};
use super::{ChatRequest, Provider, TokenSink};
use crate::error::{AppError, AppResult};
use crate::secrets;
use crate::settings::{ProviderKind, Settings};

pub enum AnyProvider {
    Anthropic(Anthropic),
    Gemini(Gemini),
    Ollama(Ollama),
    Compatible(OpenAiCompatible),
    Demo(Demo),
}

/// Prepara el proveedor `kind` con su clave (del llavero) y su dirección.
pub fn build(settings: &Settings, kind: ProviderKind, language: &str) -> AppResult<AnyProvider> {
    Ok(match kind {
        ProviderKind::Anthropic => AnyProvider::Anthropic(Anthropic { api_key: secrets::require(kind)? }),
        ProviderKind::Gemini => AnyProvider::Gemini(Gemini { api_key: secrets::require(kind)? }),
        ProviderKind::Ollama => AnyProvider::Ollama(Ollama { base_url: settings.ollama_url.clone() }),
        ProviderKind::Demo => AnyProvider::Demo(Demo { language: language.to_string() }),
        ProviderKind::Lmstudio => AnyProvider::Compatible(OpenAiCompatible {
            kind,
            base_url: settings.lmstudio_url.clone(),
            api_key: None,
        }),
        ProviderKind::Custom => {
            if settings.custom_url.is_empty() {
                return Err(AppError::MissingUrl);
            }
            AnyProvider::Compatible(OpenAiCompatible {
                kind,
                base_url: settings.custom_url.clone(),
                api_key: secrets::get(kind).ok().flatten(),
            })
        }
        ProviderKind::Openai
        | ProviderKind::Openrouter
        | ProviderKind::Groq
        | ProviderKind::Mistral
        | ProviderKind::Deepseek
        | ProviderKind::Xai => AnyProvider::Compatible(OpenAiCompatible {
            kind,
            base_url: default_base_url(kind).unwrap_or_default().to_string(),
            api_key: Some(secrets::require(kind)?),
        }),
    })
}

impl AnyProvider {
    pub async fn stream_chat(
        &self,
        http: &reqwest::Client,
        request: &ChatRequest,
        on_token: TokenSink<'_>,
    ) -> AppResult<()> {
        match self {
            AnyProvider::Anthropic(p) => p.stream_chat(http, request, on_token).await,
            AnyProvider::Gemini(p) => p.stream_chat(http, request, on_token).await,
            AnyProvider::Ollama(p) => p.stream_chat(http, request, on_token).await,
            AnyProvider::Compatible(p) => p.stream_chat(http, request, on_token).await,
            AnyProvider::Demo(p) => p.stream_chat(http, request, on_token).await,
        }
    }

    pub async fn list_models(&self, http: &reqwest::Client) -> AppResult<Vec<String>> {
        let mut models = match self {
            AnyProvider::Anthropic(p) => p.list_models(http).await,
            AnyProvider::Gemini(p) => p.list_models(http).await,
            AnyProvider::Ollama(p) => p.list_models(http).await,
            AnyProvider::Compatible(p) => p.list_models(http).await,
            AnyProvider::Demo(p) => p.list_models(http).await,
        }?;
        models.dedup();
        Ok(models)
    }
}
