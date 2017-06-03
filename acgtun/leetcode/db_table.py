import os
import sys
from os import walk
import hashlib

sys.path.append('/Users/haifeng.chen/gitcode/acgtun.com/acgtun/database')
from database import *

leetcode_solution_table = 'leetcode_solutions'
column_names = ['id', 'problem', 'cpptime', 'cppcode', 'javatime', 'javacode', 'pythontime', 'pythoncode']


def get_solutions():
    langs = ['cpp', 'java', 'python']
    path = '/Users/haifeng.chen/gitcode/leetcode/algorithms/'
    print('path: {}'.format(path))
    problems = {}
    for lang in langs:
        dir = os.path.join(path, lang)
        for dirpath, dirnames, filenames in walk(dir):
            for file in filenames:
                problem = file.replace('.' + lang, '')
                if problem not in problems.keys():
                    problems[problem] = {}
                file_path = os.path.join(dir, file)
                with open(file_path, 'r') as content_file:
                    content = content_file.read()
                problems[problem][lang] = {'time': os.path.getmtime(file_path), 'code': content}
    return problems


def create_leetcode_solution_table():
    db = Database(os.path.join('/Users/haifeng.chen/gitcode/acgtun.com/acgtun', 'db.sqlite3'))
    columns = {}
    columns['id'] = {'type': 'INTEGER', 'suffix': 'PRIMARY KEY'}
    columns['problem'] = {'type': 'TEXT', 'suffix': None}
    columns['cpptime'] = {'type': 'TIMESTAMP', 'suffix': None}
    columns['cppcode'] = {'type': 'TEXT', 'suffix': None}
    columns['javatime'] = {'type': 'TIMESTAMP', 'suffix': None}
    columns['javacode'] = {'type': 'TEXT', 'suffix': None}
    columns['pythontime'] = {'type': 'TIMESTAMP', 'suffix': None}
    columns['pythoncode'] = {'type': 'TEXT', 'suffix': None}

    db.execute(str(sql_create_table(leetcode_solution_table, columns)))
    db.commit()
    problems = get_solutions()
    for problem in problems.keys():
        print(problem)
        m = hashlib.sha256()
        m.update(problem)
        hash_id = m.hexdigest()
        if 'cpp' not in problems[problem]:
            cpp = {'time': 0, 'code': 'null'}
        else:
            cpp = problems[problem]['cpp']

        if 'java' not in problems[problem]:
            java = {'time': 0, 'code': 'null'}
        else:
            java = problems[problem]['java']

        if 'python' not in problems[problem]:
            python = {'time': 0, 'code': 'null'}
        else:
            python = problems[problem]['python']

        value = [hash_id, problem, cpp['time'], cpp['code'], java['time'], java['code'], python['time'], python['code']]
        value = tuple(v for v in value)
        db.execute(sql_insert_row(leetcode_solution_table, column_names), value)
        db.commit()


def check_tables():
    db = Database(os.path.join('/Users/haifeng.chen/gitcode/acgtun.com/acgtun', 'db.sqlite3'))
    create_leetcode_solution_table()
    """
    results = db.query("SELECT id,problem,cpptime,cppcode,javatime,javacode,pythontime,pythoncode FROM {}".format(
        leetcode_solution_table))
    for result in results:
        print(result)
        print('---------------------------')
    """


def delete_table():
    db = Database(os.path.join('/Users/haifeng.chen/gitcode/acgtun.com/acgtun', 'db.sqlite3'))
    db.execute("DELETE FROM {}".format(leetcode_solution_table))
    db.commit()


if __name__ == '__main__':
    delete_table()
    check_tables()
