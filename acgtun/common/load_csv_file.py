import csv


def replace_dot_to_dash(filed_name):
    return filed_name
    # return filed_name.replace('.', '_')


def load_csv_file(path):
    rows = []
    with open(path, 'r') as f:
        reader = csv.DictReader(c.replace('\0', '') for c in f)
        field_names = reader.fieldnames
        for r in reader:
            s = dict((replace_dot_to_dash(k), v) for k, v in r.items())
            rows.append(s)
    return set(field_names), rows
