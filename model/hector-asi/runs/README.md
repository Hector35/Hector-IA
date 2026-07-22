# Hector ASI training runs

This directory stores compact, reproducible evidence for completed training experiments. A generated checkpoint is not automatically a promoted model.

Rejected runs remain recorded when they produced real weights and changed a future training decision. Each rejection record must include the hidden-evaluation gates it failed, immutable artifact identifiers and hashes, rollback, and a concrete negative-learning statement. Large weights remain outside Git.
