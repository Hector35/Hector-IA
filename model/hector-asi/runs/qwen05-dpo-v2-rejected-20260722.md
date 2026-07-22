# Qwen05 DPO v2 — rejected

Real LoRA weights were generated twice with byte-identical SHA-256 `8d3077b00209fa3c914e7e08ce2dc234c9fd68534cd2b579e1776c887641121c`.

The candidate was rejected because hidden preference accuracy reached 33.3% versus a 66.7% gate and hidden chosen-response language loss regressed 7.34% versus a 5% maximum. No champion or runtime was changed. The next comparable experiment must preserve the hidden split and add an SFT or KL anchor.
