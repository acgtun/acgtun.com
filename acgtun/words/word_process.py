import requests


def generate_starts(prefix, words):
    starts = []
    for w in words:
        if w.startswith(prefix):
            starts.append(w)
    return starts


def generate_ends(sufix, words):
    ends = []
    for w in words:
        if w.endswith(sufix):
            ends.append(w)
    return ends


def generate_contains(subsequence, words):
    cons = []
    for w in words:
        if words.find(subsequence) >= 0:
            cons.append(w)
    return cons


def global_alignment(w1, w2):
    m = len(w1)
    n = len(w2)
    d = []
    for i in range(m + 1):
        d[i] = []
        for j in range(n + 1):
            d[i].append(0)

    d[0][0] = 0
    for i in (1, n + 1):
        d[0][i] = d[0][i - 1] + 1
    for i in range(1, m + 1):
        d[i][0] = d[i - 1][0] + 1
        for j in range(1, n + 1):
            if w1[i] == w2[j]:
                d[i][j] = d[i - 1][j - 1]
            else:
                d[i][j] = d[i - 1][j - 1] + 1
            d[i][j] = min(d[i][j], d[i - 1][j] + 1)
            d[i][j] = min(d[i][j], d[i][j - 1] + 1)
    return d[m + 1][n + 1]


def generate_similar(sim, words):
    similar = {}
    for w in words:
        d = global_alignment(sim, w)
        if d not in similar.keys():
            similar[d] = []
        similar[d].append(w)


def read_words_file():
    file = open('./static/words/valid_wordlist.txt', 'w')
    with open('./static/words/wordlist', 'r') as f:
        words = []
        for line in f:
            line = str(line).rstrip().lstrip().replace('\r\n', '')
            #url = 'https://www.merriam-webster.com/dictionary/' + line
            #print(url)
            #r = requests.get(url)
            #if r.status_code != 200:
            #    continue
            if line.find('(') >= 0:
                continue
            if line.find('-') >= 0:
                continue
            if len(line) == 0:
                continue

            words.append(line)
            file.write(line + '\n')
    file.close()
    return words


if __name__ == '__main__':
    words = read_words_file()
    print(words)
