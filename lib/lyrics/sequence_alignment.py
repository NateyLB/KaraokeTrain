"""Monotonic token matching without greedy repeated-chorus jumps."""


def monotonic_matches(reference, actual, weight=None):
    """Return increasing index pairs; optional weights can reject a match.

    Scores use two rows; byte directions retain the path without storing a
    quadratic matrix of Python floats. Unweighted matching maximizes coverage.
    """
    previous = [0.] * (len(actual) + 1)
    directions = [bytearray(len(actual) + 1) for _ in range(len(reference) + 1)]
    for i, token in enumerate(reference):
        current = [0.] * (len(actual) + 1)
        for j, observed in enumerate(actual):
            above, left = previous[j + 1], current[j]
            current[j + 1], directions[i + 1][j + 1] = (above, 1) if above >= left else (left, 2)
            if token != observed:
                continue
            score = weight(i, j) if weight else 1.
            if score is not None and previous[j] + score > current[j + 1]:
                current[j + 1], directions[i + 1][j + 1] = previous[j] + score, 3
        previous = current
    pairs = []
    i, j = len(reference), len(actual)
    while i and j:
        if directions[i][j] == 3:
            pairs.append((i - 1, j - 1))
            i, j = i - 1, j - 1
        elif directions[i][j] == 1:
            i -= 1
        else:
            j -= 1
    return list(reversed(pairs))
