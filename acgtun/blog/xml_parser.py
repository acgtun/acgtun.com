import os
from collections import OrderedDict


def get_content(start_tag, end_tag, content):
    p1 = content.find(start_tag)
    p2 = content.find(end_tag)
    # print(str(p1) + ' ' + str(p2) + ' ' + start_tag + ' ' + end_tag)
    return [p1, p2]


def item_parse(content, posts, index):
    [p1, p2] = get_content('<title>', '</title>', content)
    if p1 < 0 or p2 < 0:
        return
    title = content[p1 + len('<title>'):p2]
    content = content[p2 + len('</title>'):]

    [p1, p2] = get_content('<pubDate>', '</pubDate>', content)
    if p1 < 0 or p2 < 0:
        return
    pubDate = content[p1 + len('<pubDate>'):p2]
    content = content[p2 + len('</pubDate>'):]

    [p1, p2] = get_content('<content:encoded>', '</content:encoded>', content)
    if p1 < 0 or p2 < 0:
        return

    c = content[p1 + len('<<content:encoded>'):p2]
    content = content[p2 + len('</<content:encoded>'):]

    posts[title] = [pubDate, c]
    c = str(c).replace('\r\n\r\n', '\r\n')
    print(title)

    file_name = os.path.join('/Users/haifeng.chen/gitcode/acgtun.com/acgtun/blog/posts/', str(index) + '.cpp')
    if c.find('[cpp]') < 0:
        return

    if c.endswith('[/cpp]]]>'):
        file_name += '.cpp'
    print(file_name)
    f = open(file_name.encode('utf-8'), 'w')
    f.write('//' + title + '\n')
    f.write('//' + pubDate + "\n")
    f.write('/*')
    c = c.replace('![CDATA[[cpp]', '')
    c = c.replace('[/cpp]]]>','')
    c = c.replace('![CDATA[', '')
    f.write(c + '\n')
    f.write('*/')
    f.close()


def xml_parse(file_path='journeytothewest.wordpress.2015-02-19.xml'):
    posts = OrderedDict()
    index = 0
    with open(file_path, 'r') as content_file:
        xml_content = content_file.read()
    while len(xml_content) > 0:
        # print(xml_content)
        xml_content = str(xml_content)
        p1 = xml_content.find('<item>')
        if p1 < 0:
            break;
        # print(p1)
        p2 = xml_content.find('</item>')
        if p2 < 0:
            break
        # print(p2)
        content = xml_content[p1:p2 + 7]

        item_parse(content, posts, index)
        index += 1
        xml_content = xml_content[p2 + 7:]

    print(posts)


if __name__ == '__main__':
    xml_parse()
