# Mines Lab Python analysis package

This package provides deterministic, standard-library reference calculations for
Mines and Penalty plus prospective prediction-evaluation primitives. It is not
a live service and does not connect to 1win, the browser companion, Telegram,
or browser localStorage.

## Why it is isolated

The current Next.js deployment has no configured Python runtime or authorized
provider data source. Calling a local Python process from a deployed Next.js
application would not work on Vercel without an explicit supported runtime or
separate service. The TypeScript UI therefore remains the production interface.

The package can be used offline for independent calculation checks, research,
and future model evaluation. A future service must authenticate requests,
validate versioned contracts, and retain only authorized data.

## Run tests locally

No external Python packages are required.

```bash
python -m unittest discover -s python/tests -t python
```

Tests are intentionally not run automatically by this repository.
