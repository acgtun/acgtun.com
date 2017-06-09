import string


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


def dfs(d, n, word, ret):
    # print('{} {}'.format(d, n))
    if d == n:
        # print(word)
        s = ''
        for i in range(0, n):
            s += word[i]
        ret.append(s)
        return

    for c in string.ascii_lowercase:
        word[d] = c
        dfs(d + 1, n, word, ret)


if __name__ == '__main__':

    words = []
    with open('./static/words/valid_wordlist.txt', 'r') as f:
        for line in f:
            line = str(line).rstrip().lstrip().replace('\r\n', '')
            words.append(line)

    ret = []
    for n in range(1, 6):
        word = []
        res = []
        for i in range(0, n):
            word.append('a')
        dfs(0, n, word, res)
        ret.append(res)
    # print(ret)

    # print(words)
    for r in ret:
        l = len(r[0])
        ###########
        file_name = 'prefix_{}.csv'.format(l)
        file = open(file_name, 'w')
        file.write('prefix,words\n')
        for sub in r:
            ws = generate_starts(sub, words)
            if len(ws) == 0:
                continue
            s = ''
            for w in ws[:-1]:
                s += w
                s += "&"
            s += ws[-1]
            file.write('{},"{}"\n'.format(sub, s))
            print('{},{}'.format(sub, s))
        file.close()

        ############
        file_name = 'suffix_{}.csv'.format(l)
        file = open(file_name, 'w')
        file.write('suffix,words\n')
        for sub in r:
            ws = generate_ends(sub, words)
            if len(ws) == 0:
                continue
            s = ''
            for w in ws[:-1]:
                s += w
                s += "&"
            s += ws[-1]
            file.write('{},"{}"\n'.format(sub, s))
            print('{},{}'.format(sub, s))
        file.close()
